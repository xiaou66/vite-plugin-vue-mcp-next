import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS } from '../../src/constants'
import { createScreenshotOutput } from '../../src/mcp/tools/screenshotOutput'

const IMAGE_BASE64 = Buffer.from('ABC').toString('base64')

describe('createScreenshotOutput', () => {
  it('writes screenshots to project-relative saveDir in path mode', async () => {
    const root = path.join(tmpdir(), `vue-mcp-screenshot-${String(Date.now())}`)
    const result = await createScreenshotOutput(createContext(root), {
      source: 'cdp',
      target: 'viewport',
      format: 'png',
      data: IMAGE_BASE64,
      width: 100,
      height: 40,
      mimeType: 'image/png',
      byteLength: 3
    })

    expect(result).toMatchObject({
      source: 'cdp',
      target: 'viewport',
      format: 'png',
      width: 100,
      height: 40,
      mimeType: 'image/png',
      byteLength: 3
    })
    expect(result).not.toHaveProperty('data')
    expect(result.path).toContain(
      `${path.sep}.vite-mcp${path.sep}screenshot${path.sep}`
    )
    expect(result.relativePath).toMatch(/^\.vite-mcp\/screenshot\//)
    await expect(readFile(result.path as string, 'utf8')).resolves.toBe('ABC')
  })

  it('returns base64 data without writing a file in base64 mode', async () => {
    const root = path.join(tmpdir(), `vue-mcp-screenshot-${String(Date.now())}`)
    const result = await createScreenshotOutput(
      createContext(root, { type: 'base64' }),
      {
        source: 'snapdom',
        target: 'element',
        format: 'webp',
        data: IMAGE_BASE64,
        width: 100,
        height: 40,
        mimeType: 'image/webp',
        byteLength: 3,
        limitations: ['snapdom limitation']
      }
    )

    expect(result).toMatchObject({
      source: 'snapdom',
      target: 'element',
      format: 'webp',
      data: IMAGE_BASE64,
      limitations: ['snapdom limitation']
    })
    expect(result).not.toHaveProperty('path')
    expect(result).not.toHaveProperty('relativePath')
  })

  it('resolves absolute saveDir without prefixing project root', async () => {
    const root = path.join(tmpdir(), `vue-mcp-root-${String(Date.now())}`)
    const saveDir = path.join(tmpdir(), `vue-mcp-absolute-${String(Date.now())}`)
    const result = await createScreenshotOutput(
      createContext(root, { saveDir }),
      {
        source: 'cdp',
        target: 'fullPage',
        format: 'jpeg',
        data: IMAGE_BASE64,
        width: 100,
        height: 40,
        mimeType: 'image/jpeg',
        byteLength: 3
      }
    )

    expect(result.path).toContain(saveDir)
    expect(result.relativePath).toBe(
      path.relative(root, result.path as string).split(path.sep).join('/')
    )
  })

  it('rejects empty saveDir in path mode', async () => {
    await expect(
      createScreenshotOutput(createContext(tmpdir(), { saveDir: '   ' }), {
        source: 'cdp',
        target: 'viewport',
        format: 'png',
        data: IMAGE_BASE64,
        width: 100,
        height: 40,
        mimeType: 'image/png',
        byteLength: 3
      })
    ).rejects.toThrow('screenshot.saveDir must be a non-empty string')
  })
})

function createContext(
  root: string,
  screenshot: Partial<typeof DEFAULT_OPTIONS.screenshot> = {}
) {
  return {
    server: {
      config: { root }
    },
    options: {
      ...DEFAULT_OPTIONS,
      screenshot: {
        ...DEFAULT_OPTIONS.screenshot,
        ...screenshot,
        snapdom: DEFAULT_OPTIONS.screenshot.snapdom
      }
    }
  }
}
