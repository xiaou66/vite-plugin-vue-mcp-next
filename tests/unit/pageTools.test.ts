import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS } from '../../src/constants'
import { createVueMcpNextContext } from '../../src/context'
import { createCdpClient } from '../../src/cdp/cdpClient'
import { registerPageTools } from '../../src/mcp/tools/pages'

vi.mock('../../src/cdp/cdpClient', () => ({
  createCdpClient: vi.fn()
}))

describe('registerPageTools', () => {
  it('hides disconnected runtime targets by default and shows them on demand', async () => {
    const server = createServer()
    const ctx = createVueMcpNextContext(DEFAULT_OPTIONS)

    ctx.pages.upsert({
      pageId: 'runtime-connected',
      source: 'runtime',
      url: 'http://localhost:5173/connected.html',
      pathname: '/connected.html',
      connected: true
    })
    ctx.pages.upsert({
      pageId: 'runtime-disconnected',
      source: 'runtime',
      url: 'http://localhost:5173/disconnected.html',
      pathname: '/disconnected.html',
      connected: true
    })
    ctx.pages.disconnect('runtime-disconnected')

    registerPageTools(server as never, ctx, createViteServer() as never)

    const defaultResult = await server.tools.list_pages({})
    const visiblePages = defaultResult.structuredContent.pages as Array<{
      readonly pageId: string
    }>

    expect(visiblePages.map((page) => page.pageId)).toEqual([
      'runtime-connected'
    ])

    const debugResult = await server.tools.list_pages({ includeDisconnected: true })
    const allPages = debugResult.structuredContent.pages as Array<{
      readonly pageId: string
    }>

    expect(allPages.map((page) => page.pageId)).toEqual([
      'runtime-connected',
      'runtime-disconnected'
    ])
  })

  it('reloads selected page with CDP ignoreCache when CDP endpoint is configured', async () => {
    const server = createServer()
    const pageReload = vi.fn(() => Promise.resolve())
    const loadEventFired = vi.fn(() => Promise.resolve())
    const close = vi.fn(() => Promise.resolve())
    const connect = vi.fn(() =>
      Promise.resolve({
        Page: { enable: vi.fn(), loadEventFired, reload: pageReload },
        on: vi.fn(),
        send: vi.fn(),
        close
      } as never)
    )

    vi.mocked(createCdpClient).mockReturnValue({
      listTargets: vi.fn(() => Promise.resolve([])),
      connect
    })

    const ctx = createVueMcpNextContext({
      ...DEFAULT_OPTIONS,
      cdp: { wsEndpoint: 'ws://127.0.0.1:9222/devtools/page/1' }
    })

    registerPageTools(server as never, ctx, createViteServer() as never)
    const result = await server.tools.reload_page({})

    expect(connect).toHaveBeenCalledWith('ws://127.0.0.1:9222/devtools/page/1')
    expect(pageReload).toHaveBeenCalledWith({ ignoreCache: true })
    expect(loadEventFired).toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
    expect(result.structuredContent).toMatchObject({
      ok: true,
      source: 'cdp',
      ignoreCache: true
    })
  })

  it('waits for Runtime Hook page reconnect and disconnects the old page', async () => {
    const server = createServer()
    const ctx = createVueMcpNextContext(DEFAULT_OPTIONS)
    let runtimeCallback: ((data: unknown) => void) | undefined
    let reconnectCallback: ((data: unknown) => void) | undefined

    const reloadPage = vi.fn(({ event }: { event: string }) => {
      if (event) {
        runtimeCallback?.({ ok: true, source: 'hook' })
        reconnectCallback?.({
          pageId: 'runtime-new',
          source: 'runtime',
          url: 'http://localhost:5173/',
          pathname: '/',
          connected: true
        })
      }
    })

    ctx.rpcServer = {
      reloadPage
    } as never
    ctx.pages.upsert({
      pageId: 'runtime-old',
      source: 'runtime',
      url: 'http://localhost:5173/',
      pathname: '/',
      connected: true
    })
    ctx.hooks.hookOnce = (event: string, cb: (data: unknown) => void) => {
      if (event === 'vite-plugin-vue-mcp-next:page-reconnected') {
        reconnectCallback = cb
      } else {
        runtimeCallback = cb
      }

      return () => undefined
    }

    registerPageTools(server as never, ctx, createViteServer() as never)
    const result = await server.tools.reload_page({ pageId: 'runtime-old' })

    expect(reloadPage).toHaveBeenCalled()
    expect(ctx.pages.get('runtime-old')?.connected).toBe(false)
    expect(result.structuredContent).toMatchObject({
      ok: true,
      source: 'hook',
      reconnected: true,
      pageId: 'runtime-new'
    })
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

function createViteServer() {
  return {
    config: {
      root: process.cwd()
    },
    middlewares: {
      stack: []
    }
  }
}

interface ToolResult {
  readonly structuredContent: {
    readonly [key: string]: unknown
  }
}
