import type CDP from 'chrome-remote-interface'
import { startCdpConsole } from '../cdp/cdpConsole'
import { createCdpClient } from '../cdp/cdpClient'
import { startCdpNetwork } from '../cdp/cdpNetwork'
import { matchCdpTarget } from '../cdp/targetMatcher'
import { shouldUseCdp } from '../mcp/routeTools'
import type {
  CdpLifecycleController,
  PageTarget,
  VueMcpNextContext
} from '../types'

/**
 * 创建 CDP 生命周期控制器。
 *
 * 该控制器只在用户配置 CDP 时工作；未配置时保持空操作，让 Hook 通道继续承担默认采集。
 */
export function createCdpLifecycleController(
  ctx: VueMcpNextContext
): CdpLifecycleController {
  const clients = new Map<string, CDP.Client>()

  return {
    async connectPage(target) {
      if (clients.has(target.pageId) || !shouldStartCdp(ctx)) {
        return
      }

      const client = await safeConnectCdp(ctx, target)

      if (!client) {
        return
      }

      clients.set(target.pageId, client)
      try {
        await startCdpObservers(ctx, target, client)
      } catch (error) {
        clients.delete(target.pageId)
        await client.close()
        warnWhenCdpForced(ctx, error)
      }
    },
    async closeAll() {
      await Promise.all([...clients.values()].map((client) => client.close()))
      clients.clear()
    }
  }
}

/**
 * 判断是否需要启动 CDP 长连接。
 *
 * 只有 Console 或 Network 至少一个能力需要 CDP 时才建立连接，避免用户只配置 CDP 给 DOM/Evaluate
 * 按需使用时也被动占用浏览器调试连接。
 */
function shouldStartCdp(ctx: VueMcpNextContext): boolean {
  const consoleUsesCdp = shouldUseCdp({
    options: ctx.options,
    capabilityMode: ctx.options.runtime.mode,
    hasMatchedCdpTarget: true
  })
  const networkUsesCdp = shouldUseCdp({
    options: ctx.options,
    capabilityMode: ctx.options.network.mode,
    hasMatchedCdpTarget: true
  })

  return consoleUsesCdp || networkUsesCdp
}

/**
 * 安全连接页面对应的 CDP target。
 *
 * `auto` 模式下 CDP 失败应回退到 Hook，不应打断 Vite 启动；`cdp` 模式的工具调用仍会返回明确错误。
 */
async function safeConnectCdp(
  ctx: VueMcpNextContext,
  target: PageTarget
): Promise<CDP.Client | undefined> {
  try {
    return await connectCdp(ctx, target)
  } catch (error) {
    warnWhenCdpForced(ctx, error)

    return undefined
  }
}

/**
 * 只在强制 CDP 模式下输出警告。
 *
 * `auto` 模式的失败是预期回退路径，不应该污染普通开发日志；强制 CDP 则需要提示用户修正端点。
 */
function warnWhenCdpForced(ctx: VueMcpNextContext, error: unknown): void {
  if (ctx.options.runtime.mode !== 'cdp' && ctx.options.network.mode !== 'cdp') {
    return
  }

  console.warn(
    `[vite-plugin-vue-mcp-next] CDP connect failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  )
}

/**
 * 连接指定页面的 CDP target。
 *
 * browserUrl 需要先发现 target 再连接；wsEndpoint 则认为用户已经完成目标选择，直接连接即可。
 */
async function connectCdp(
  ctx: VueMcpNextContext,
  target: PageTarget
): Promise<CDP.Client | undefined> {
  const cdp = createCdpClient(ctx.options.cdp)

  if (ctx.options.cdp.wsEndpoint) {
    return cdp.connect(ctx.options.cdp.wsEndpoint)
  }

  if (!ctx.options.cdp.browserUrl) {
    return undefined
  }

  const matched = matchCdpTarget(await cdp.listTargets(), {
    url: target.url,
    targetUrlPattern: ctx.options.cdp.targetUrlPattern
  })

  if (!matched?.webSocketDebuggerUrl) {
    return undefined
  }

  return cdp.connect(matched.webSocketDebuggerUrl)
}

/**
 * 启动需要长连接的 CDP 监听器。
 *
 * DOM 和 Evaluate 是短请求能力，不在这里注册；Console 和 Network 必须持续监听才能捕获事件时间线。
 */
async function startCdpObservers(
  ctx: VueMcpNextContext,
  target: PageTarget,
  client: CDP.Client
): Promise<void> {
  if (ctx.options.runtime.mode !== 'hook') {
    await startCdpConsole({
      client,
      pageId: target.pageId,
      push: (record) => {
        ctx.consoleRecords.push(record)
      }
    })
  }

  if (
    ctx.options.network.mode === 'auto' ||
    ctx.options.network.mode === 'cdp'
  ) {
    await startCdpNetwork({
      client,
      pageId: target.pageId,
      maskHeaders: ctx.options.network.maskHeaders,
      captureResponseBody: ctx.options.network.captureResponseBody,
      push: (record) => {
        ctx.networkRecords.push(record)
      }
    })
  }
}
