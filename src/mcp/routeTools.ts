import type CDP from 'chrome-remote-interface'
import { nanoid } from 'nanoid'
import { createCdpClient } from '../cdp/cdpClient'
import { matchCdpTarget } from '../cdp/targetMatcher'
import type { CdpTargetSummary } from '../cdp/targetMatcher'
import type {
  PageTarget,
  ResolvedVueMcpNextOptions,
  RuntimeMode,
  VueMcpNextContext
} from '../types'

/**
 * CDP 路由判断参数。
 *
 * 把判断输入收拢到对象中，可以避免后续工具增加条件时继续堆位置参数。
 */
export interface ShouldUseCdpOptions {
  /** 已解析配置，提供 runtime、network 和 cdp 开关。 */
  readonly options: ResolvedVueMcpNextOptions
  /** 当前工具是否已经找到匹配页面的 CDP target。 */
  readonly hasMatchedCdpTarget: boolean
  /** 当前能力自己的通道模式，例如 runtime.mode 或 network.mode。 */
  readonly capabilityMode: RuntimeMode | 'off'
}

/**
 * 判断通用 DevTools 能力是否应走 CDP。
 *
 * DOM、Console、Evaluate、Network 都遵循 CDP 优先但可回退的规则，
 * 集中判断可以避免各工具出现不一致的优先级。
 */
export function shouldUseCdp(options: ShouldUseCdpOptions): boolean {
  if (options.capabilityMode === 'off' || options.capabilityMode === 'hook') {
    return false
  }

  if (!options.hasMatchedCdpTarget) {
    return false
  }

  return Boolean(
    options.options.cdp.browserUrl || options.options.cdp.wsEndpoint
  )
}

/**
 * 创建 MCP 文本和结构化双格式响应。
 *
 * 同时返回 text 和 structuredContent，可以兼容通用 MCP 客户端展示和 AI 结构化读取。
 */
export function createToolResponse<T>(data: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data
  }
}

/**
 * 创建 MCP 错误响应。
 *
 * 工具失败时返回结构化错误，比直接抛异常更容易让 AI 解释下一步操作。
 */
export function createToolError(message: string, data?: unknown) {
  return createToolResponse({
    ok: false,
    error: message,
    data
  })
}

/**
 * 解析 MCP 工具目标页面。
 *
 * 多页面场景下用户可能不传 pageId，此时只能在唯一已连接页面时自动选择，
 * 避免工具误操作到错误页面。
 */
export function resolvePageTarget(
  ctx: VueMcpNextContext,
  pageId?: string
): PageTarget {
  const targets = ctx.pages.list().filter((target) => target.connected)

  if (pageId) {
    const target = targets.find((item) => item.pageId === pageId)

    if (!target) {
      throw new Error(`Page target not found: ${pageId}`)
    }

    return target
  }

  if (targets.length === 1) {
    return targets[0]
  }

  throw new Error(
    'Multiple or no page targets available. Call list_pages and pass pageId.'
  )
}

/**
 * 解析并连接当前页面对应的 CDP client。
 *
 * CDP 是可选通道，工具层需要按 pageId 或 targetUrlPattern 精确匹配，避免多 tab 场景下误连其他页面。
 */
export async function connectCdpForPage(
  ctx: VueMcpNextContext,
  pageId?: string
): Promise<{ client: CDP.Client; target?: CdpTargetSummary } | undefined> {
  if (!ctx.options.cdp.browserUrl && !ctx.options.cdp.wsEndpoint) {
    return undefined
  }

  const cdp = createCdpClient(ctx.options.cdp)

  if (ctx.options.cdp.wsEndpoint) {
    return { client: await cdp.connect(ctx.options.cdp.wsEndpoint) }
  }

  const page = resolvePageTarget(ctx, pageId)
  const target = matchCdpTarget(await cdp.listTargets(), {
    url: page.url,
    targetUrlPattern: ctx.options.cdp.targetUrlPattern
  })

  if (!target?.webSocketDebuggerUrl) {
    return undefined
  }

  return { client: await cdp.connect(target.webSocketDebuggerUrl), target }
}

/**
 * 关闭 CDP client。
 *
 * 每次工具调用按需连接 CDP，结束后必须关闭，避免开发服务器长时间持有无用调试连接。
 */
export async function closeCdpClient(client: CDP.Client): Promise<void> {
  await client.close()
}

/**
 * 请求浏览器 Runtime Bridge 数据并等待一次回调。
 *
 * DOM 与 Evaluate 的 Hook fallback 需要从页面上下文读取数据，复用这里可以保证超时、
 * 并发事件隔离和错误结构在不同 MCP 工具之间保持一致。
 */
export async function requestRuntimeData(
  ctx: VueMcpNextContext,
  trigger: (event: string) => void
): Promise<unknown> {
  if (!ctx.rpcServer) {
    return { ok: false, error: 'runtime bridge is not connected' }
  }

  const event = nanoid()

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ ok: false, error: 'runtime bridge response timed out' })
    }, 5000)

    ctx.hooks.hookOnce(event, (data) => {
      clearTimeout(timeout)
      resolve(data)
    })
    trigger(event)
  })
}
