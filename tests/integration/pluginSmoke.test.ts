import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  registerTool: vi.fn(),
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

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    readonly registerTool = mocks.registerTool
  }
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

describe('vueMcpNext plugin shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setupMcpTransport.mockImplementation(
      (_path: string, createServer: () => void) => {
        createServer()
      }
    )
  })

  it('registers the performance tools during plugin boot', async () => {
    const { vueMcpNext } = await import('../../src')
    const plugin = vueMcpNext()
    const fakeServer = {
      config: {
        root: process.cwd(),
        server: {
          port: 5173
        }
      },
      ws: {
        on: vi.fn()
      },
      httpServer: {
        once: vi.fn()
      }
    }

    await (plugin.configureServer as (server: never) => Promise<void>)(
      fakeServer as never
    )

    const toolNames = mocks.registerTool.mock.calls.map((call) =>
      String(call[0])
    )

    expect(toolNames).toEqual(
      expect.arrayContaining([
        'record_performance',
        'start_performance_recording',
        'stop_performance_recording',
        'get_performance_report',
        'take_heap_snapshot'
      ])
    )
  })
})
