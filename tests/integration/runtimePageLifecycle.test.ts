import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS } from '../../src/constants'
import type { VueMcpNextContext } from '../../src/types'
const actualContext = await vi.importActual<typeof import('../../src/context')>(
  '../../src/context'
)

const mocks = vi.hoisted(() => ({
  createVueMcpNextContext: vi.fn(),
  createRPCServer: vi.fn(() => ({})),
  setupMcpTransport: vi.fn(),
  updateMcpClientConfigs: vi.fn(() => Promise.resolve(undefined)),
  updateSkillConfigs: vi.fn(() => Promise.resolve(undefined)),
  createRuntimeInjectionController: vi.fn(() => ({
    resolveId: vi.fn(() => null),
    load: vi.fn(() => null),
    transform: vi.fn(() => null),
    transformIndexHtml: vi.fn(() => null)
  })),
  createCdpLifecycleController: vi.fn(() => ({
    connectPage: vi.fn(() => Promise.resolve(undefined)),
    closeAll: vi.fn(() => Promise.resolve(undefined))
  }))
}))

vi.mock('../../src/context', () => ({
  createVueMcpNextContext: mocks.createVueMcpNextContext
}))

vi.mock('vite-dev-rpc', () => ({
  createRPCServer: mocks.createRPCServer
}))

vi.mock('../../src/mcp/transport', () => ({
  setupMcpTransport: mocks.setupMcpTransport
}))

vi.mock('../../src/plugin/injectRuntime', () => ({
  createRuntimeInjectionController: mocks.createRuntimeInjectionController
}))

vi.mock('../../src/plugin/cdpLifecycle', () => ({
  createCdpLifecycleController: mocks.createCdpLifecycleController
}))

vi.mock('../../src/plugin/mcpClientConfig', () => ({
  updateMcpClientConfigs: mocks.updateMcpClientConfigs
}))

vi.mock('../../src/plugin/skillConfig', () => ({
  updateSkillConfigs: mocks.updateSkillConfigs
}))

describe('runtime page lifecycle in plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setupMcpTransport.mockImplementation(
      (_path: string, createServer: () => void) => {
        createServer()
      }
    )
  })

  it('disconnects runtime pages when the browser side reports page-disconnected', async () => {
    const { vueMcpNext } = await import('../../src/plugin/createPlugin')
    const ctx = createTestContext(actualContext.createPageTargetRegistry())
    mocks.createVueMcpNextContext.mockReturnValue(ctx)

    const { handlers } = await configurePlugin(vueMcpNext())

    expect(handlers.has('vite-plugin-vue-mcp-next:page-connected')).toBe(true)
    expect(handlers.has('vite-plugin-vue-mcp-next:heartbeat')).toBe(true)
    expect(handlers.has('vite-plugin-vue-mcp-next:page-disconnected')).toBe(
      true
    )

    handlers.get('vite-plugin-vue-mcp-next:page-connected')?.({
      pageId: 'runtime-1',
      source: 'runtime',
      url: 'http://localhost:5173/',
      pathname: '/',
      connected: true
    })

    expect(ctx.pages.get('runtime-1')?.connected).toBe(true)

    handlers.get('vite-plugin-vue-mcp-next:heartbeat')?.({
      pageId: 'runtime-1',
      timestamp: 30_000
    })
    handlers.get('vite-plugin-vue-mcp-next:page-disconnected')?.({
      pageId: 'runtime-1'
    })

    expect(ctx.pages.get('runtime-1')?.connected).toBe(false)
    expect(ctx.pages.get('runtime-1')?.disconnectedAt).toBeDefined()
  })

  it('disconnects stale runtime pages after the heartbeat timeout', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    try {
      const { vueMcpNext } = await import('../../src/plugin/createPlugin')
      const ctx = createTestContext(actualContext.createPageTargetRegistry())
      mocks.createVueMcpNextContext.mockReturnValue(ctx)

      const { handlers } = await configurePlugin(vueMcpNext())

      handlers.get('vite-plugin-vue-mcp-next:page-connected')?.({
        pageId: 'runtime-2',
        source: 'runtime',
        url: 'http://localhost:5173/',
        pathname: '/',
        connected: true
      })

      await vi.advanceTimersByTimeAsync(45_000)

      expect(ctx.pages.get('runtime-2')?.connected).toBe(false)
      expect(ctx.pages.get('runtime-2')?.disconnectedAt).toBe(45_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops the heartbeat scanner when the dev server closes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    try {
      const { vueMcpNext } = await import('../../src/plugin/createPlugin')
      const ctx = createTestContext(actualContext.createPageTargetRegistry())
      mocks.createVueMcpNextContext.mockReturnValue(ctx)

      const { closeHandlers, handlers } = await configurePlugin(vueMcpNext())

      handlers.get('vite-plugin-vue-mcp-next:page-connected')?.({
        pageId: 'runtime-3',
        source: 'runtime',
        url: 'http://localhost:5173/',
        pathname: '/',
        connected: true
      })

      closeHandlers[0]?.()
      await vi.advanceTimersByTimeAsync(45_000)

      expect(ctx.pages.get('runtime-3')?.connected).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

function createTestContext(
  pages: ReturnType<typeof actualContext.createPageTargetRegistry>
): VueMcpNextContext {
  return {
    options: DEFAULT_OPTIONS,
    hooks: {
      callHook: vi.fn()
    } as unknown as VueMcpNextContext['hooks'],
    server: undefined,
    rpcServer: undefined,
    pages,
    consoleRecords: {
      push: vi.fn()
    } as unknown as VueMcpNextContext['consoleRecords'],
    networkRecords: {
      push: vi.fn()
    } as unknown as VueMcpNextContext['networkRecords'],
    performanceReports: {
      push: vi.fn()
    } as unknown as VueMcpNextContext['performanceReports'],
    performanceSessions: new Map()
  }
}

async function configurePlugin(
  plugin: ReturnType<typeof import('../../src/plugin/createPlugin')['vueMcpNext']>
): Promise<{
  readonly handlers: Map<string, (payload: unknown) => void>
  readonly closeHandlers: Array<() => void>
}> {
  const handlers = new Map<string, (payload: unknown) => void>()
  const closeHandlers: Array<() => void> = []
  const server = {
    config: {
      root: process.cwd(),
      server: {
        port: 5173
      }
    },
    ws: {
      on: vi.fn((event: string, handler: (payload: unknown) => void) => {
        handlers.set(event, handler)
      })
    },
    httpServer: {
      once: vi.fn((event: string, handler: () => void) => {
        if (event === 'close') {
          closeHandlers.push(handler)
        }
      })
    }
  }

  await (plugin.configureServer as (server: never) => Promise<void>)(
    server as never
  )

  expect(mocks.createVueMcpNextContext).toHaveBeenCalledTimes(1)

  return {
    handlers,
    closeHandlers
  }
}
