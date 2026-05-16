import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ViteDevServer } from 'vite'
import { createCdpClient } from '../../cdp/cdpClient'
import { MCP_TOOL_NAMES } from '../../constants'
import { discoverHtmlEntries } from '../../plugin/entryDiscovery'
import type { PageTarget, VueMcpNextContext } from '../../types'
import { createToolResponse } from '../routeTools'

/**
 * 注册页面目标相关 MCP 工具。
 *
 * 页面目标是所有调试工具的入口，先提供 list 能力可以让 AI 明确后续操作作用在哪个页面。
 */
export function registerPageTools(
  server: McpServer,
  ctx: VueMcpNextContext,
  vite: ViteDevServer
): void {
  server.registerTool(
    MCP_TOOL_NAMES.listPages,
    {
      description: 'List Vite page entries and connected runtime/CDP targets.'
    },
    async () => {
      const cdpResult = await listCdpPageTargets(ctx)

      for (const target of cdpResult.pages) {
        ctx.pages.upsert(target)
        void ctx.cdpLifecycle?.connectPage(target)
      }

      return createToolResponse({
        entries: discoverHtmlEntries(vite),
        pages: ctx.pages.list(),
        cdpError: cdpResult.error
      })
    }
  )
}

/**
 * 查询 CDP 暴露的页面 target。
 *
 * `list_pages` 是用户选择调试目标的入口，因此即使页面还没有 runtime bridge 连接，
 * 也应该展示 CDP 侧可见 target，方便纯 CDP 调试场景使用。
 */
async function listCdpPageTargets(ctx: VueMcpNextContext): Promise<{
  readonly pages: PageTarget[]
  readonly error?: string
}> {
  if (ctx.options.cdp.wsEndpoint) {
    return { pages: [createWsEndpointTarget(ctx.options.cdp.wsEndpoint)] }
  }

  if (!ctx.options.cdp.browserUrl) {
    return { pages: [] }
  }

  try {
    const targets = await createCdpClient(ctx.options.cdp).listTargets()

    return {
      pages: targets
        .filter((target) => target.type === 'page')
        .map((target) => ({
          pageId: `cdp:${target.id}`,
          source: 'cdp',
          url: target.url,
          pathname: getPathname(target.url),
          title: target.title,
          connected: Boolean(target.webSocketDebuggerUrl)
        }))
    }
  } catch (error) {
    return {
      pages: [],
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * 为直接传入 wsEndpoint 的场景创建虚拟页面。
 *
 * 直接 WebSocket endpoint 无法通过 `/json/list` 获取 URL，但仍然是合法 CDP 接入方式，
 * 因此用固定 pageId 暴露给 MCP 客户端，工具调用时会直接连接该 endpoint。
 */
function createWsEndpointTarget(wsEndpoint: string): PageTarget {
  return {
    pageId: 'cdp:ws-endpoint',
    source: 'cdp',
    url: wsEndpoint,
    pathname: 'cdp:ws-endpoint',
    title: 'CDP WebSocket endpoint',
    connected: true
  }
}

/**
 * 从 URL 中提取 pathname。
 *
 * CDP target 可能包含 `about:blank` 等非标准页面 URL，解析失败时保留原值，
 * 这样 `list_pages` 不会因为浏览器临时页面导致整个工具失败。
 */
function getPathname(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}
