import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { MCP_TOOL_NAMES } from '../../constants'
import { cdpEvaluate } from '../../cdp/cdpEvaluate'
import type { ResolvedVueMcpNextOptions, VueMcpNextContext } from '../../types'
import {
  closeCdpClient,
  connectCdpForPage,
  createToolError,
  createToolResponse,
  requestRuntimeData,
  shouldUseCdp
} from '../routeTools'

/**
 * 注册受控脚本执行工具。
 *
 * Evaluate 是高风险能力，先单独成组可以让后续默认关闭和权限提示逻辑更容易审查。
 */
export function registerEvaluateTools(
  server: McpServer,
  ctx: VueMcpNextContext
): void {
  server.registerTool(
    MCP_TOOL_NAMES.evaluateScript,
    {
      description:
        'Evaluate a script in the selected page when explicitly enabled.',
      inputSchema: {
        pageId: z.string().optional(),
        expression: z.string(),
        awaitPromise: z.boolean().optional()
      }
    },
    async (input) => {
      try {
        assertEvaluateEnabled(ctx.options)
      } catch (error) {
        return createToolError(
          error instanceof Error ? error.message : String(error)
        )
      }

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
          const value = await cdpEvaluate({
            client: cdp.client,
            expression: input.expression,
            awaitPromise: input.awaitPromise
          })

          return createToolResponse({ source: 'cdp', value })
        } finally {
          await closeCdpClient(cdp.client)
        }
      }

      const result = await requestRuntimeData(ctx, (event) => {
        void ctx.rpcServer?.evaluateScript({
          event,
          expression: input.expression,
          awaitPromise: input.awaitPromise,
          timeoutMs: ctx.options.runtime.evaluate.timeoutMs
        })
      })

      return createToolResponse({ source: 'hook', result })
    }
  )
}

/**
 * 校验控制台执行是否已启用。
 *
 * evaluate_script 可以读取和修改页面状态，必须默认拒绝，避免 MCP 客户端无意中获得任意脚本执行能力。
 */
export function assertEvaluateEnabled(
  options: ResolvedVueMcpNextOptions
): void {
  if (!options.runtime.evaluate.enabled) {
    throw new Error(
      'evaluate_script is disabled. Enable runtime.evaluate.enabled to use it.'
    )
  }
}
