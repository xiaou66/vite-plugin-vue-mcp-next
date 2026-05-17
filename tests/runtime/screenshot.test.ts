import { describe, expect, it, vi } from 'vitest'
import { takeRuntimeScreenshot } from '../../src/runtime/screenshot'

describe('takeRuntimeScreenshot', () => {
  it('captures an element with snapdom and path plugins', async () => {
    const element = {
      getBoundingClientRect: () => ({ width: 100, height: 40 })
    } as Element
    Object.assign(globalThis, {
      document: {
        querySelector: (selector: string) =>
          selector === '#app' ? element : null,
        documentElement: element
      }
    })
    const snapdom = vi.fn(() =>
      Promise.resolve({
        toBlob: () => Promise.resolve(new Blob(['ABC'], { type: 'image/png' }))
      })
    )

    const result = await takeRuntimeScreenshot({
      target: 'element',
      selector: '#app',
      format: 'png',
      snapdom: { options: { scale: 2 }, plugins: [] },
      loadSnapdom: () => Promise.resolve({ snapdom }),
      loadModule: () => Promise.resolve({ default: { name: 'noop' } })
    })

    expect(snapdom).toHaveBeenCalledWith(
      element,
      expect.objectContaining({ scale: 2 })
    )
    expect(result.ok).toBe(true)
    expect(result.source).toBe('snapdom')
    expect(result.data).toBe('QUJD')
    expect(result.byteLength).toBe(3)
  })

  it('loads plugin factories from Vite import paths', async () => {
    const element = {
      getBoundingClientRect: () => ({ width: 100, height: 40 })
    } as Element
    Object.assign(globalThis, {
      document: {
        querySelector: () => element,
        documentElement: element
      }
    })
    const plugin = { name: 'mask' }
    const pluginFactory = vi.fn(() => plugin)
    const snapdom = vi.fn(() =>
      Promise.resolve({
        toBlob: () => Promise.resolve(new Blob(['ABC'], { type: 'image/png' }))
      })
    )

    await takeRuntimeScreenshot({
      target: 'viewport',
      format: 'png',
      snapdom: {
        options: {},
        plugins: [
          {
            path: '@/screenshot/mask',
            exportName: 'createMaskPlugin',
            options: { selectors: ['.token'] }
          }
        ]
      },
      loadSnapdom: () => Promise.resolve({ snapdom }),
      loadModule: () => Promise.resolve({ createMaskPlugin: pluginFactory })
    })

    expect(pluginFactory).toHaveBeenCalledWith({ selectors: ['.token'] })
    expect(snapdom).toHaveBeenCalledWith(
      element,
      expect.objectContaining({ plugins: [plugin] })
    )
  })

  it('returns an error when element selector is missing', async () => {
    const result = await takeRuntimeScreenshot({
      target: 'element',
      format: 'png',
      snapdom: { options: {}, plugins: [] },
      loadSnapdom: () => Promise.resolve({ snapdom: vi.fn() }),
      loadModule: () => Promise.resolve({ default: {} })
    })

    expect(result).toEqual({
      ok: false,
      error: 'selector is required when target is element'
    })
  })

  it('returns a structured error when snapdom optional peer is missing', async () => {
    const element = {
      getBoundingClientRect: () => ({ width: 100, height: 40 })
    } as Element
    Object.assign(globalThis, {
      document: {
        querySelector: () => element,
        documentElement: element
      }
    })

    const result = await takeRuntimeScreenshot({
      target: 'viewport',
      format: 'png',
      snapdom: { options: {}, plugins: [] },
      loadSnapdom: () =>
        Promise.reject(
          new Error(
            '缺少可选依赖 @zumer/snapdom。DOM 截图降级需要该依赖，请执行：pnpm add -D @zumer/snapdom'
          )
        ),
      loadModule: () => Promise.resolve({ default: {} })
    })

    expect(result).toEqual({
      ok: false,
      source: 'snapdom',
      error:
        '缺少可选依赖 @zumer/snapdom。DOM 截图降级需要该依赖，请执行：pnpm add -D @zumer/snapdom'
    })
  })
})
