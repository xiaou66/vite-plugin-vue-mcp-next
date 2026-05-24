import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS } from '../../src/constants'
import { registerStorageTools } from '../../src/mcp/tools/storage'

describe('registerStorageTools', () => {
  it('registers the storage tool group', () => {
    const server = createServer()
    const ctx = createContext()

    registerStorageTools(server as never, ctx as never)

    expect(Object.keys(server.tools)).toEqual([
      'list_storage',
      'get_storage_item',
      'set_storage_item',
      'delete_storage_item',
      'clear_storage'
    ])
  })

  it('falls back to runtime cookie access without CDP configuration', async () => {
    const server = createServer()
    const ctx = createContext()

    ctx.rpcServer.manageStorage.mockImplementation(
      (payload: { event: string; scope: string }) => {
        ctx.callbacks.get(payload.event)?.({
          ok: true,
          source: 'hook',
          action: 'get',
          scope: payload.scope,
          data: {
            cookies: [{ name: 'sid', value: 'alpha' }]
          }
        })
      }
    )

    registerStorageTools(server as never, ctx as never)
    const result = await server.tools.get_storage_item({
      scope: 'cookie',
      cookie: { name: 'sid' }
    })

    expect(result.structuredContent).toMatchObject({
      ok: true,
      source: 'hook',
      scope: 'cookie',
      data: {
        cookies: [{ name: 'sid', value: 'alpha' }]
      }
    })
  })

  it('aggregates same-origin storage when listing storage', async () => {
    const server = createServer()
    const ctx = createContext()
    const responses = new Map([
      [
        'localStorage',
        {
          ok: true,
          source: 'hook',
          action: 'list',
          scope: 'localStorage',
          data: { entries: [{ key: 'token', value: 'alpha' }] }
        }
      ],
      [
        'sessionStorage',
        {
          ok: true,
          source: 'hook',
          action: 'list',
          scope: 'sessionStorage',
          data: { entries: [{ key: 'draft', value: 'beta' }] }
        }
      ],
      [
        'indexedDB',
        {
          ok: true,
          source: 'hook',
          action: 'list',
          scope: 'indexedDB',
          data: { databases: [{ name: 'app-db', version: 1 }] }
        }
      ],
      [
        'cookie',
        {
          ok: true,
          source: 'hook',
          action: 'list',
          scope: 'cookie',
          data: { cookies: [{ name: 'sid', value: 'alpha' }] }
        }
      ]
    ])

    ctx.rpcServer.manageStorage.mockImplementation(
      (payload: { event: string; scope: string }) => {
        ctx.callbacks.get(payload.event)?.(responses.get(payload.scope))
      }
    )

    registerStorageTools(server as never, ctx as never)
    const result = await server.tools.list_storage({})

    expect(result.structuredContent).toMatchObject({
      origin: 'https://app.example',
      localStorage: { entries: [{ key: 'token', value: 'alpha' }] },
      sessionStorage: { entries: [{ key: 'draft', value: 'beta' }] },
      indexedDB: { databases: [{ name: 'app-db', version: 1 }] },
      cookie: { cookies: [{ name: 'sid', value: 'alpha' }] }
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

interface ToolResult {
  readonly structuredContent: {
    readonly ok?: boolean
    readonly error?: string
    readonly [key: string]: unknown
  }
}

function createContext() {
  const callbacks = new Map<string, (data: unknown) => void>()
  const rpcServer = {
    manageStorage: vi.fn()
  }

  return {
    options: DEFAULT_OPTIONS,
    rpcServer,
    pages: {
      list: vi.fn(() => [
        {
          pageId: 'page-1',
          source: 'runtime',
          url: 'https://app.example/dashboard',
          pathname: '/dashboard',
          connected: true
        }
      ])
    },
    hooks: {
      hookOnce: vi.fn((event: string, cb: (data: unknown) => void) => {
        callbacks.set(event, cb)
      })
    },
    callbacks
  }
}
