import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS, MCP_TOOL_NAMES } from '../../src/constants'
import { registerElementContextTools } from '../../src/mcp/tools/elementContext'

function createServer() {
  const tools = new Map<string, (input: unknown) => unknown>()

  return {
    tools,
    registerTool(
      name: string,
      _definition: unknown,
      handler: (input: unknown) => unknown
    ) {
      tools.set(name, handler)
    }
  }
}

describe('get_element_context tool', () => {
  it('returns static editable context for project ids when runtime is unavailable', async () => {
    const server = createServer()
    registerElementContextTools(server as never, {
      options: DEFAULT_OPTIONS,
      hooks: { hookOnce: vi.fn(), callHook: vi.fn() },
      pages: { list: () => [], get: () => undefined },
      consoleRecords: undefined,
      networkRecords: undefined,
      performanceReports: undefined,
      performanceSessions: new Map()
    } as never)

    const result = await server.tools.get(MCP_TOOL_NAMES.getElementContext)?.({
      elementId: 'src/App.vue:2:3'
    })

    expect(result).toMatchObject({
      structuredContent: {
        ok: true,
        editable: true,
        codeLocation: {
          file: 'src/App.vue',
          line: 2,
          column: 3
        }
      }
    })
  })
})
