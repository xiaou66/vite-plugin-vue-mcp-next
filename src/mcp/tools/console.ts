import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { MCP_TOOL_NAMES } from '../../constants'
import type { VueMcpNextContext } from '../../types'
import { createToolResponse, requestRuntimeData } from '../routeTools'

/**
 * 注册 Console 相关 MCP 工具。
 *
 * 日志采集会来自 CDP 和页面 Hook 两条通道，独立注册能让缓存和清理语义保持一致。
 */
export function registerConsoleTools(
  server: McpServer,
  ctx: VueMcpNextContext
): void {
  server.registerTool(
    MCP_TOOL_NAMES.getConsoleLogs,
    {
      description: 'Get console logs for the selected page.',
      inputSchema: {
        pageId: z.string().optional(),
        level: z.enum(['log', 'info', 'warn', 'error', 'debug']).optional(),
        limit: z.number().optional()
      }
    },
    (input) => {
      const logs = ctx.consoleRecords
        .all()
        .filter((record) => !input.pageId || record.pageId === input.pageId)
        .filter((record) => !input.level || record.level === input.level)
        .slice(-(input.limit ?? ctx.options.console.maxRecords))

      return createToolResponse({ logs })
    }
  )

  server.registerTool(
    MCP_TOOL_NAMES.clearConsoleLogs,
    {
      description: 'Clear cached console logs for the selected page.',
      inputSchema: {
        pageId: z.string().optional()
      }
    },
    () => {
      ctx.consoleRecords.clear()

      return createToolResponse({ ok: true })
    }
  )

  server.registerTool(
    MCP_TOOL_NAMES.inspectConsoleArg,
    {
      description:
        'Inspect an object argument captured from runtime console logs by argId.',
      inputSchema: {
        argId: z.string(),
        maxDepth: z.number().optional(),
        maxKeys: z.number().optional(),
        maxArrayItems: z.number().optional(),
        maxStringLength: z.number().optional(),
        maxTotalNodes: z.number().optional()
      }
    },
    async (input) => {
      const data = await requestRuntimeData(ctx, (event) => {
        void ctx.rpcServer?.inspectConsoleArg({
          event,
          argId: input.argId,
          maxDepth: input.maxDepth,
          maxKeys: input.maxKeys,
          maxArrayItems: input.maxArrayItems,
          maxStringLength: input.maxStringLength,
          maxTotalNodes: input.maxTotalNodes
        })
      })

      return createToolResponse({ source: 'hook', data })
    }
  )
}
