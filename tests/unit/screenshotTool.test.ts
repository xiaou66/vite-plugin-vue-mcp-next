import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS } from '../../src/constants'
import { registerScreenshotTools } from '../../src/mcp/tools/screenshot'

describe('registerScreenshotTools', () => {
  it('routes to runtime when prefer is runtime', async () => {
    const server = createServer()
    const ctx = createContext()

    registerScreenshotTools(server as never, ctx as never)
    await server.tools.take_screenshot({
      prefer: 'runtime',
      target: 'viewport',
      format: 'png'
    })

    expect(ctx.rpcServer.takeScreenshot).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'viewport',
        format: 'png'
      })
    )
  })

  it('rejects element screenshots without selector', async () => {
    const server = createServer()
    const ctx = createContext()

    registerScreenshotTools(server as never, ctx as never)
    const result = await server.tools.take_screenshot({
      target: 'element'
    })

    expect(result.structuredContent.ok).toBe(false)
    expect(result.structuredContent.error).toContain('selector')
  })

  it('rejects runtime screenshots larger than maxBytes', async () => {
    const server = createServer()
    const ctx = createContext({
      screenshot: {
        ...DEFAULT_OPTIONS.screenshot,
        maxBytes: 1
      }
    })

    registerScreenshotTools(server as never, ctx as never)
    const result = await server.tools.take_screenshot({
      prefer: 'runtime',
      target: 'viewport',
      format: 'png'
    })

    expect(result.structuredContent.ok).toBe(false)
    expect(result.structuredContent.error).toContain('too large')
  })

  it('returns a saved file path by default for runtime screenshots', async () => {
    const root = path.join(tmpdir(), `vue-mcp-tool-${String(Date.now())}`)
    const server = createServer()
    const ctx = createContext({ root })

    registerScreenshotTools(server as never, ctx as never)
    const result = await server.tools.take_screenshot({
      prefer: 'runtime',
      target: 'viewport',
      format: 'png'
    })

    expect(result.structuredContent.path).toContain(
      `${path.sep}.vite-mcp${path.sep}screenshot${path.sep}`
    )
    expect(result.structuredContent.relativePath).toMatch(
      /^\.vite-mcp\/screenshot\//
    )
    expect(result.structuredContent.data).toBeUndefined()
    await expect(
      readFile(result.structuredContent.path as string, 'utf8')
    ).resolves.toBe('ABC')
  })

  it('keeps base64 output when screenshot.type is base64', async () => {
    const server = createServer()
    const ctx = createContext({
      screenshot: {
        ...DEFAULT_OPTIONS.screenshot,
        type: 'base64'
      }
    })

    registerScreenshotTools(server as never, ctx as never)
    const result = await server.tools.take_screenshot({
      prefer: 'runtime',
      target: 'viewport',
      format: 'png'
    })

    expect(result.structuredContent.data).toBe('QUJD')
    expect(result.structuredContent.path).toBeUndefined()
    expect(result.structuredContent.relativePath).toBeUndefined()
  })
})

function createServer() {
  const tools: Record<string, (input: unknown) => Promise<ToolResult>> = {}

  return {
    tools,
    registerTool(
      name: string,
      _config: unknown,
      handler: (input: unknown) => Promise<ToolResult>
    ) {
      tools[name] = handler
    }
  }
}

interface ToolResult {
  readonly structuredContent: {
    readonly ok?: boolean
    readonly error?: string
    readonly [key: string]: unknown
  }
}

function createContext(
  options: Partial<typeof DEFAULT_OPTIONS> & { root?: string } = {}
) {
  let callback: ((data: unknown) => void) | undefined
  const { root = tmpdir(), ...resolvedOptions } = options
  const rpcServer = {
    takeScreenshot: vi.fn((payload: { event: string }) => {
      if (payload.event) {
        callback?.({
          ok: true,
          source: 'snapdom',
          data: 'QUJD',
          width: 100,
          height: 40,
          mimeType: 'image/png',
          byteLength: 3
        })
      }
      return Promise.resolve()
    })
  }

  return {
    server: createViteServer(root),
    options: {
      ...DEFAULT_OPTIONS,
      ...resolvedOptions
    },
    rpcServer,
    hooks: {
      hookOnce(_event: string, cb: (data: unknown) => void) {
        callback = cb
      }
    }
  }
}

function createViteServer(root: string) {
  return {
    config: { root }
  }
}
