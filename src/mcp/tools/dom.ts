import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { MCP_TOOL_NAMES } from '../../constants'
import { cdpGetDomSnapshot, cdpQueryDom } from '../../cdp/cdpDom'
import type { VueMcpNextContext } from '../../types'
import {
  closeCdpClient,
  connectCdpForPage,
  createToolResponse,
  requestRuntimeData,
  shouldUseCdp
} from '../routeTools'

/**
 * 注册 DOM 相关 MCP 工具。
 *
 * DOM 能力后续会同时接 CDP 和页面 Hook，因此先独立成组，避免和 Vue 组件语义混在一起。
 */
export function registerDomTools(
  server: McpServer,
  ctx: VueMcpNextContext
): void {
  server.registerTool(
    MCP_TOOL_NAMES.getDomTree,
    {
      description: 'Get a clipped DOM tree for the selected page.',
      inputSchema: {
        pageId: z.string().optional(),
        maxDepth: z.number().optional(),
        maxNodes: z.number().optional()
      }
    },
    async (input) => {
      const cdp = await connectCdpForPage(ctx, input.pageId)

      if (
        cdp &&
        shouldUseCdp({
          options: ctx.options,
          capabilityMode: ctx.options.runtime.mode,
          hasMatchedCdpTarget: true
        })
      ) {
        try {
          const snapshot = await cdpGetDomSnapshot(cdp.client)

          return createToolResponse({
            source: 'cdp',
            snapshot,
            limits: {
              maxDepth: input.maxDepth ?? ctx.options.dom.maxDepth,
              maxNodes: input.maxNodes ?? ctx.options.dom.maxNodes
            }
          })
        } finally {
          await closeCdpClient(cdp.client)
        }
      }

      const snapshot = await requestRuntimeData(ctx, (event) => {
        void ctx.rpcServer?.getDomTree({
          event,
          maxDepth: input.maxDepth ?? ctx.options.dom.maxDepth,
          maxNodes: input.maxNodes ?? ctx.options.dom.maxNodes,
          maxTextLength: ctx.options.dom.maxTextLength
        })
      })

      return createToolResponse({ source: 'hook', snapshot })
    }
  )

  server.registerTool(
    MCP_TOOL_NAMES.queryDom,
    {
      description: 'Query DOM nodes by selector in the selected page.',
      inputSchema: {
        pageId: z.string().optional(),
        selector: z.string(),
        limit: z.number().optional()
      }
    },
    async (input) => {
      const cdp = await connectCdpForPage(ctx, input.pageId)

      if (
        cdp &&
        shouldUseCdp({
          options: ctx.options,
          capabilityMode: ctx.options.runtime.mode,
          hasMatchedCdpTarget: true
        })
      ) {
        try {
          const nodes = await cdpQueryDom(
            cdp.client,
            input.selector,
            input.limit ?? 20
          )

          return createToolResponse({ source: 'cdp', nodes })
        } finally {
          await closeCdpClient(cdp.client)
        }
      }

      const nodes = await requestRuntimeData(ctx, (event) => {
        void ctx.rpcServer?.queryDom({
          event,
          selector: input.selector,
          limit: input.limit ?? 20
        })
      })

      return createToolResponse({ source: 'hook', nodes })
    }
  )
}
