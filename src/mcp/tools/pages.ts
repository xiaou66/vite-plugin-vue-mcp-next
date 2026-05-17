import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ViteDevServer } from 'vite'
import { createCdpClient } from '../../cdp/cdpClient'
import { MCP_TOOL_NAMES, RUNTIME_PAGE_RECONNECTED_EVENT } from '../../constants'
import { discoverHtmlEntries } from '../../plugin/entryDiscovery'
import type { PageTarget, VueMcpNextContext } from '../../types'
import {
  closeCdpClient,
  connectCdpForPage,
  createToolError,
  createToolResponse,
  requestRuntimeData,
  resolvePageTarget
} from '../routeTools'

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

  server.registerTool(
    MCP_TOOL_NAMES.reloadPage,
    {
      description:
        'Reload the selected page. CDP uses ignoreCache; Runtime Hook falls back to normal reload.',
      inputSchema: {
        pageId: z.string().optional(),
        ignoreCache: z.boolean().optional()
      }
    },
    async (input) => {
      if (hasCdpConfig(ctx)) {
        return reloadPageWithCdp(ctx, input.pageId, input.ignoreCache ?? true)
      }

      const target = resolveRuntimeReloadTarget(ctx, input.pageId)

      if (!target.ok) {
        return createToolError(target.error)
      }

      const reconnect = waitForRuntimePageReconnect(ctx)
      ctx.pages.disconnect(target.page.pageId)

      const result = await requestRuntimeData(ctx, (event) => {
        void ctx.rpcServer?.reloadPage({ event })
      })

      if (!isRecord(result) || result.ok === false) {
        reconnect.cancel()

        return createToolResponse(
          isRecord(result)
            ? result
            : { ok: false, error: 'Invalid runtime reload response' }
        )
      }

      const page = await reconnect.promise

      return createToolResponse(
        page
          ? { ...result, reconnected: true, pageId: page.pageId, page }
          : {
              ...result,
              reconnected: false,
              error: 'runtime page reconnect timed out'
            }
      )
    }
  )
}

/**
 * 判断是否应进入 CDP 刷新路径。
 *
 * 刷新工具的语义和 DOM/Evaluate 不同：只要用户显式配置了 CDP，就应该使用浏览器协议的
 * `ignoreCache` 能力；未配置时才退回 Runtime Hook 普通刷新。
 */
function hasCdpConfig(ctx: VueMcpNextContext): boolean {
  return Boolean(ctx.options.cdp.browserUrl || ctx.options.cdp.wsEndpoint)
}

/**
 * 校验 Runtime RPC 回包是否可作为 MCP structuredContent。
 *
 * Runtime 通道来自浏览器页面，服务端需要把未知值收窄为对象，避免 MCP SDK 的结构化响应类型
 * 接收到数组或原始值。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 解析 Runtime 刷新的目标页面。
 *
 * Runtime reload 会让旧 bridge 失效，因此刷新前必须先定位并标记旧 pageId，
 * 避免 `list_pages` 在新页面连接后同时保留两个可用目标。
 */
function resolveRuntimeReloadTarget(
  ctx: VueMcpNextContext,
  pageId?: string
): { ok: true; page: PageTarget } | { ok: false; error: string } {
  try {
    const page = resolvePageTarget(ctx, pageId)

    if (page.source !== 'runtime') {
      return {
        ok: false,
        error: 'Runtime reload requires a runtime page target'
      }
    }

    return { ok: true, page }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * 等待刷新后的 Runtime 页面重新接入。
 *
 * 该等待只用于确认页面 bridge 已经重新建立；超时返回 null，让调用方可以把“已触发但未确认”
 * 明确暴露给 MCP 客户端，而不是无限挂起。
 */
function waitForRuntimePageReconnect(ctx: VueMcpNextContext): {
  readonly promise: Promise<PageTarget | null>
  cancel(): void
} {
  let timeout: NodeJS.Timeout | undefined
  let cleanup: (() => void) | undefined
  const promise = new Promise<PageTarget | null>((resolve) => {
    timeout = setTimeout(() => {
      cleanup?.()
      resolve(null)
    }, 5000)
    cleanup = ctx.hooks.hookOnce(RUNTIME_PAGE_RECONNECTED_EVENT, (payload) => {
      if (timeout) {
        clearTimeout(timeout)
      }

      resolve(isPageTarget(payload) ? payload : null)
    })
  })

  return {
    promise,
    cancel() {
      if (timeout) {
        clearTimeout(timeout)
      }

      cleanup?.()
    }
  }
}

/**
 * 校验页面重连事件载荷。
 *
 * 事件来自浏览器运行时，刷新工具只依赖页面目标最小字段，避免把异常 payload 当成刷新完成。
 */
function isPageTarget(value: unknown): value is PageTarget {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.pageId === 'string' &&
    (value.source === 'runtime' || value.source === 'cdp') &&
    typeof value.url === 'string' &&
    typeof value.pathname === 'string' &&
    typeof value.connected === 'boolean'
  )
}

/**
 * 通过 CDP 执行页面刷新。
 *
 * `ignoreCache` 是 CDP 的标准刷新参数，适合测试前规避浏览器 HTTP 缓存；
 * 连接生命周期仍保持按工具调用即连即关，避免开发服务器长期占用调试连接。
 */
async function reloadPageWithCdp(
  ctx: VueMcpNextContext,
  pageId: string | undefined,
  ignoreCache: boolean
) {
  const cdp = await connectCdpForPage(ctx, pageId)

  if (!cdp) {
    return createToolError('CDP target is unavailable for page reload')
  }

  try {
    await cdp.client.Page.enable()
    const loaded = cdp.client.Page.loadEventFired()
    await cdp.client.Page.reload({ ignoreCache })
    await loaded

    return createToolResponse({
      ok: true,
      source: 'cdp',
      ignoreCache,
      pageId
    })
  } finally {
    await closeCdpClient(cdp.client)
  }
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
