import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { MCP_TOOL_NAMES } from '../../constants'
import type { VueMcpNextContext } from '../../types'
import { createToolError, createToolResponse } from '../routeTools'

/**
 * 注册 Network 相关 MCP 工具。
 *
 * 网络调试需要摘要、详情和清理三个入口，提前分组可以让后续 CDP/Hook 双通道实现只替换本文件。
 */
export function registerNetworkTools(
  server: McpServer,
  ctx: VueMcpNextContext
): void {
  server.registerTool(
    MCP_TOOL_NAMES.getNetworkRequests,
    {
      description: 'Get captured network request summaries.',
      inputSchema: {
        pageId: z.string().optional(),
        urlContains: z.string().optional(),
        method: z.string().optional(),
        status: z.number().optional(),
        limit: z.number().optional()
      }
    },
    (input) => {
      if (ctx.options.network.mode === 'off') {
        return createToolError(
          'Network collection is disabled by configuration'
        )
      }

      const records = ctx.networkRecords
        .all()
        .filter((record) => !input.pageId || record.pageId === input.pageId)
        .filter(
          (record) =>
            !input.urlContains || record.url.includes(input.urlContains)
        )
        .filter(
          (record) =>
            !input.method ||
            record.method.toUpperCase() === input.method.toUpperCase()
        )
        .filter(
          (record) =>
            input.status === undefined || record.status === input.status
        )
        .slice(-(input.limit ?? ctx.options.network.maxRecords))

      return createToolResponse({ requests: records })
    }
  )

  server.registerTool(
    MCP_TOOL_NAMES.getNetworkRequestDetail,
    {
      description: 'Get captured network request detail by id.',
      inputSchema: { id: z.string() }
    },
    (input) => {
      if (ctx.options.network.mode === 'off') {
        return createToolError(
          'Network collection is disabled by configuration'
        )
      }

      const record = ctx.networkRecords
        .all()
        .find((item) => item.id === input.id)

      return createToolResponse({ request: record ?? null })
    }
  )

  server.registerTool(
    MCP_TOOL_NAMES.clearNetworkRequests,
    {
      description: 'Clear cached network requests.',
      inputSchema: {
        pageId: z.string().optional()
      }
    },
    () => {
      ctx.networkRecords.clear()

      return createToolResponse({ ok: true })
    }
  )
}
