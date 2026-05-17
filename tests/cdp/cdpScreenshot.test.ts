import { describe, expect, it, vi } from 'vitest'
import { cdpCaptureScreenshot } from '../../src/cdp/cdpScreenshot'

describe('cdpCaptureScreenshot', () => {
  it('captures viewport screenshots', async () => {
    const client = createClient()

    const result = await cdpCaptureScreenshot({
      client: client as never,
      target: 'viewport',
      format: 'png'
    })

    expect(client.Page.captureScreenshot).toHaveBeenCalledWith({
      format: 'png',
      captureBeyondViewport: false
    })
    expect(result).toEqual({
      data: 'base64-image',
      width: 1280,
      height: 720
    })
  })

  it('captures full page screenshots with content size clip', async () => {
    const client = createClient()

    await cdpCaptureScreenshot({
      client: client as never,
      target: 'fullPage',
      format: 'jpeg',
      quality: 80
    })

    expect(client.Page.captureScreenshot).toHaveBeenCalledWith({
      format: 'jpeg',
      quality: 80,
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: 1440,
        height: 2400,
        scale: 1
      }
    })
  })

  it('captures element screenshots with selector clip', async () => {
    const client = createClient()

    const result = await cdpCaptureScreenshot({
      client: client as never,
      target: 'element',
      selector: '#app',
      format: 'png'
    })

    expect(client.Runtime.evaluate).toHaveBeenCalledOnce()
    const [evaluateInput] = client.Runtime.evaluate.mock.calls[0] ?? []
    expect(evaluateInput).toBeDefined()
    const input = evaluateInput as {
      expression: string
      awaitPromise: boolean
      returnByValue: boolean
    }
    expect(input.expression).toContain('document.querySelector("#app")')
    expect(input.awaitPromise).toBe(true)
    expect(input.returnByValue).toBe(true)
    expect(client.Page.captureScreenshot).toHaveBeenCalledWith({
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 10,
        y: 25,
        width: 300,
        height: 120,
        scale: 1
      }
    })
    expect(result.width).toBe(300)
    expect(result.height).toBe(120)
  })

  it('returns a clear error when element selector does not match', async () => {
    const client = createClient({ elementRect: null })

    await expect(
      cdpCaptureScreenshot({
        client: client as never,
        target: 'element',
        selector: '#missing',
        format: 'png'
      })
    ).rejects.toThrow('element not found: #missing')
  })
})

function createClient(options: { elementRect?: unknown } = {}) {
  return {
    Page: {
      getLayoutMetrics: vi.fn(() =>
        Promise.resolve({
          cssLayoutViewport: { clientWidth: 1280, clientHeight: 720 },
          cssContentSize: { x: 0, y: 0, width: 1440, height: 2400 }
        })
      ),
      captureScreenshot: vi.fn(() => Promise.resolve({ data: 'base64-image' }))
    },
    Runtime: {
      evaluate: vi.fn((input: unknown) => {
        void input
        return Promise.resolve({
          result: {
            value:
              options.elementRect === undefined
                ? { x: 10, y: 25, width: 300, height: 120 }
                : options.elementRect
          }
        })
      })
    }
  }
}
