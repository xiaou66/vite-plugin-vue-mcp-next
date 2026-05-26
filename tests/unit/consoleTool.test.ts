import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS } from '../../src/constants'
import { createVueMcpNextContext } from '../../src/context'
import { registerConsoleTools } from '../../src/mcp/tools/console'
import type { RuntimeConsoleArgInspectRequest } from '../../src/types'

type ToolResult = {
  readonly structuredContent: unknown
}

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>

describe('registerConsoleTools', () => {
  it('requests runtime console arg inspection by argId', async () => {
    const server = createServer()
    const ctx = createVueMcpNextContext(DEFAULT_OPTIONS)

    const inspectConsoleArg = vi.fn(
      (request: RuntimeConsoleArgInspectRequest) => {
        const event = request.event ?? ''
        void ctx.hooks.callHook(event, {
          ok: true,
          argId: 'console-arg-1',
          preview: { count: 1 }
        })
      }
    )
    const rpcServer = {
      inspectConsoleArg
    } as unknown as NonNullable<typeof ctx.rpcServer>
    ctx.rpcServer = rpcServer

    registerConsoleTools(server as never, ctx)
    const result = await server.tools.inspect_console_arg({
      argId: 'console-arg-1',
      maxDepth: 1,
      maxKeys: 5
    })

    expect(inspectConsoleArg).toHaveBeenCalledWith(
      expect.objectContaining({
        argId: 'console-arg-1',
        maxDepth: 1,
        maxKeys: 5
      })
    )
    expect(result.structuredContent).toEqual({
      source: 'hook',
      data: {
        ok: true,
        argId: 'console-arg-1',
        preview: { count: 1 }
      }
    })
  })
})

function createServer() {
  return {
    tools: {} as Record<string, ToolHandler>,
    registerTool(name: string, _config: unknown, handler: ToolHandler) {
      this.tools[name] = handler
    }
  }
}
