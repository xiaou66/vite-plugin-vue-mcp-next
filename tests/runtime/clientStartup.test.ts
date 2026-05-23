import { beforeEach, describe, expect, it, vi } from 'vitest'

const createHotContext = vi.fn()
const initializeVueDevtoolsHook = vi.fn()
const installVueBridge = vi.fn()
const installPerformanceHook = vi.fn()
const installConsoleHook = vi.fn()
const installNetworkHook = vi.fn()
const getRuntimeClientId = vi.fn(() => 'runtime-client-test')
const getRuntimePageIdentity = vi.fn(() => ({
  pageId: 'runtime-test',
  source: 'runtime',
  url: 'http://localhost:3456/',
  pathname: '/',
  title: 'Test page',
  runtimeClientId: 'runtime-client-test',
  connected: true,
  readyState: 'complete',
  viewport: {
    width: 1280,
    height: 720
  }
}))

vi.mock('vite-hot-client', () => ({
  createHotContext
}))

vi.mock('../../src/runtime/vueBridge', () => ({
  initializeVueDevtoolsHook,
  installVueBridge
}))

vi.mock('../../src/runtime/performanceHook', () => ({
  installPerformanceHook
}))

vi.mock('../../src/runtime/consoleHook', () => ({
  installConsoleHook
}))

vi.mock('../../src/runtime/networkHook', () => ({
  installNetworkHook
}))

vi.mock('../../src/runtime/pageIdentity', () => ({
  getRuntimeClientId,
  getRuntimePageIdentity
}))

describe('startRuntimeClient', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('window', {
      location: { href: 'http://localhost:3456/' },
      innerWidth: 1280,
      innerHeight: 720
    })
    vi.stubGlobal('document', {
      title: 'Test page',
      readyState: 'complete'
    })
  })

  it('initializes Vue devtools hook before waiting for Vite hot context', async () => {
    const hot = { send: vi.fn() }
    let resolveHotContext: (value: unknown) => void = () => {}
    createHotContext.mockReturnValue(
      new Promise((resolve) => {
        resolveHotContext = resolve
      })
    )

    const { startRuntimeClient } = await import('../../src/runtime/client')
    const started = startRuntimeClient()

    expect(initializeVueDevtoolsHook).toHaveBeenCalledTimes(1)
    expect(createHotContext).toHaveBeenCalledTimes(1)
    expect(installVueBridge).not.toHaveBeenCalled()

    resolveHotContext(hot)
    await started

    expect(installVueBridge).toHaveBeenCalledWith(hot)
    expect(hot.send).toHaveBeenCalledWith(
      'vite-plugin-vue-mcp-next:page-connected',
      expect.objectContaining({ pageId: 'runtime-test' })
    )
  })

  it('installs the performance hook during runtime startup', async () => {
    const send = (): void => undefined
    const hot = {
      send
    }
    createHotContext.mockResolvedValue(hot)

    const { startRuntimeClient } = await import('../../src/runtime/client')
    await startRuntimeClient()

    const [arg] = vi.mocked(installPerformanceHook).mock.calls[0] as [
      {
        readonly pageId: string
        readonly send: (report: unknown) => void
      }
    ]

    expect(arg.pageId).toBe('runtime-test')
    expect(typeof arg.send).toBe('function')
  })
})
