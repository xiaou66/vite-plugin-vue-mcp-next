/**
 * MCP 元素上下文工具。
 *
 * 工具只接受用户已经复制的 elementId，不阻塞等待浏览器点击；
 * runtime 在线时返回组件和 DOM 增强信息，离线时仍能解析项目源码或第三方包边界。
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { MCP_TOOL_NAMES } from '../../constants'
import { parseElementId } from '../../shared/elementId'
import type { ElementContextResult, VueMcpNextContext } from '../../types'
import {
  createToolResponse,
  requestRuntimeData,
  resolvePageTarget
} from '../routeTools'

/**
 * 注册元素上下文查询工具。
 *
 * 该工具只按用户提供的 elementId 查询上下文，不等待浏览器点击，避免 MCP 请求长期悬挂。
 */
export function registerElementContextTools(
  server: McpServer,
  ctx: VueMcpNextContext
): void {
  server.registerTool(
    MCP_TOOL_NAMES.getElementContext,
    {
      description:
        'Get editable source, Vue component, and DOM context for a copied elementId.',
      inputSchema: {
        elementId: z.string(),
        pageId: z.string().optional()
      }
    },
    async (input) => {
      const runtimeResult = await tryRuntimeElementContext(
        ctx,
        input.elementId,
        input.pageId
      )

      if (runtimeResult) {
        return createToolResponse(runtimeResult)
      }

      return createToolResponse(createStaticElementContext(input.elementId))
    }
  )
}

/**
 * 尝试通过浏览器 runtime 获取完整元素上下文。
 *
 * 项目源码和第三方包 ID 可以静态解析；runtime ID 必须依赖浏览器页面，否则无法反查 DOM 引用。
 */
async function tryRuntimeElementContext(
  ctx: VueMcpNextContext,
  elementId: string,
  pageId?: string
): Promise<ElementContextResult | undefined> {
  if (!ctx.rpcServer) {
    return parseElementId(elementId).kind === 'runtime'
      ? createRuntimeUnavailableContext(elementId)
      : undefined
  }

  try {
    resolvePageTarget(ctx, pageId)
  } catch (error) {
    const parsed = parseElementId(elementId)

    if (parsed.kind === 'project-source' || parsed.kind === 'package') {
      return undefined
    }

    return {
      ok: false,
      elementId,
      error: error instanceof Error ? error.message : String(error),
      limitations: ['call list_pages and pass pageId when multiple pages exist']
    }
  }

  return (await requestRuntimeData(ctx, (event) => {
    void ctx.rpcServer?.getElementContext({ event, elementId })
  })) as ElementContextResult
}

/**
 * 创建静态元素上下文。
 *
 * 静态 fallback 不依赖浏览器页面，因此只能返回源码位置或第三方包边界，不能提供 DOM/组件摘要。
 */
function createStaticElementContext(elementId: string): ElementContextResult {
  const parsed = parseElementId(elementId)

  if (parsed.kind === 'project-source') {
    return {
      ok: true,
      elementId,
      editable: true,
      codeLocation: {
        file: parsed.file,
        line: parsed.line,
        column: parsed.column
      },
      limitations: ['runtime unavailable, DOM and component context omitted']
    }
  }

  if (parsed.kind === 'package') {
    return {
      ok: true,
      elementId,
      editable: false,
      packageLocation: {
        packageName: parsed.packageName,
        entryFile: parsed.entryFile
      },
      limitations: ['third-party package source is not editable from this project']
    }
  }

  if (parsed.kind === 'runtime') {
    return createRuntimeUnavailableContext(elementId)
  }

  return {
    ok: false,
    elementId,
    error: parsed.reason,
    limitations: ['please provide a copied elementId from the element picker']
  }
}

/**
 * 创建 runtime 不可用错误。
 *
 * runtime ID 没有静态含义，浏览器断开后必须要求用户重新选择。
 */
function createRuntimeUnavailableContext(elementId: string): ElementContextResult {
  return {
    ok: false,
    elementId,
    error: 'runtime bridge is not connected',
    limitations: ['runtime ids are only valid while the page is connected']
  }
}
