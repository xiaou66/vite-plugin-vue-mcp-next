import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMcpTransport } from '../../src/mcp/transport'

const mocks = vi.hoisted(() => {
  const sseTransports: MockSseTransport[] = []
  const streamableTransports: MockStreamableTransport[] = []

  class MockSseTransport {
    readonly sessionId = `sse-${String(sseTransports.length + 1)}`
    readonly handlePostMessage = vi.fn(() => Promise.resolve(undefined))

    constructor(
      readonly messagePath: string,
      readonly response: unknown
    ) {
      sseTransports.push(this)
    }
  }

  class MockStreamableTransport {
    readonly close = vi.fn(() => Promise.resolve(undefined))
    readonly handleRequest = vi.fn(() => Promise.resolve(undefined))

    constructor(readonly options: { sessionIdGenerator?: unknown }) {
      streamableTransports.push(this)
    }
  }

  return {
    MockSseTransport,
    MockStreamableTransport,
    sseTransports,
    streamableTransports
  }
})

vi.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: mocks.MockSseTransport
}))

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: mocks.MockStreamableTransport
}))

describe('setupMcpTransport', () => {
  beforeEach(() => {
    mocks.sseTransports.length = 0
    mocks.streamableTransports.length = 0
  })

  it('registers legacy SSE and Streamable HTTP MCP routes', () => {
    const { vite } = createMockVite()

    setupMcpTransport('/__mcp', createMockMcpServer as never, vite as never)

    expect([...vite.middlewares.routes.keys()]).toEqual([
      '/__mcp/sse',
      '/__mcp/mcp',
      '/__mcp/messages'
    ])
  })

  it('creates a stateless Streamable HTTP transport for POST requests', async () => {
    const { vite } = createMockVite()
    const server = createMockMcpServer()

    setupMcpTransport('/__mcp', (() => server) as never, vite as never)
    await vite.middlewares.call('/__mcp/mcp', {
      req: createMockRequest('POST'),
      res: createMockResponse()
    })

    expect(server.connect).toHaveBeenCalledWith(mocks.streamableTransports[0])
    expect(mocks.streamableTransports[0]?.options).toEqual({
      sessionIdGenerator: undefined
    })
    expect(mocks.streamableTransports[0]?.handleRequest).toHaveBeenCalled()
  })

  it('rejects non-POST Streamable HTTP requests', async () => {
    const { vite } = createMockVite()
    const res = createMockResponse()

    setupMcpTransport('/__mcp', createMockMcpServer as never, vite as never)
    await vite.middlewares.call('/__mcp/mcp', {
      req: createMockRequest('GET'),
      res
    })

    expect(res.statusCode).toBe(405)
    expect(res.end).toHaveBeenCalledWith('Method Not Allowed')
    expect(mocks.streamableTransports).toHaveLength(0)
  })
})

function createMockVite() {
  const routes = new Map<string, RouteHandler>()

  return {
    vite: {
      middlewares: {
        routes,
        use(path: string, handler: RouteHandler) {
          routes.set(path, handler)
        },
        async call(path: string, options: RouteCallOptions) {
          const handler = routes.get(path)
          if (!handler) {
            throw new Error(`Missing route: ${path}`)
          }

          await handler(options.req, options.res)
        }
      }
    }
  }
}

function createMockMcpServer() {
  return {
    connect: vi.fn(() => Promise.resolve(undefined)),
    close: vi.fn(() => Promise.resolve(undefined))
  }
}

function createMockRequest(method: string) {
  return {
    method,
    url: ''
  }
}

function createMockResponse() {
  return {
    statusCode: 200,
    end: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn()
  }
}

type MockRequest = ReturnType<typeof createMockRequest>
type MockResponse = ReturnType<typeof createMockResponse>
type RouteHandler = (req: MockRequest, res: MockResponse) => void | Promise<void>
type RouteCallOptions = { req: MockRequest; res: MockResponse }
