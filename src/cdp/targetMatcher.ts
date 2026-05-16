/**
 * CDP target 摘要。
 *
 * CDP `/json/list` 返回字段很多，调试工具只需要这些字段来选择页面目标。
 */
export interface CdpTargetSummary {
  /** CDP target ID，用于连接和排查目标选择。 */
  readonly id: string
  /** target 类型，首版只处理 page，避免误连 service worker。 */
  readonly type: string
  /** target 当前 URL，用于和 runtime 页面建立关联。 */
  readonly url: string
  /** 页面标题，用于展示和调试。 */
  readonly title?: string
  /** 连接该 target 的 WebSocket 地址。 */
  readonly webSocketDebuggerUrl?: string
}

/**
 * CDP target 匹配参数。
 *
 * 多页面和多 tab 场景下不能随便选第一个 target，需要按 URL 和用户配置明确匹配。
 */
export interface MatchCdpTargetOptions {
  /** runtime 页面 URL，优先用于精确匹配。 */
  readonly url?: string
  /** 用户提供的 URL 匹配规则，用于 URL 不完全一致的代理或子路径场景。 */
  readonly targetUrlPattern?: string | RegExp
}

/**
 * 匹配可调试的 CDP 页面 target。
 *
 * 该函数只做纯匹配，不负责网络连接，便于测试多页面选择规则。
 */
export function matchCdpTarget(
  targets: readonly CdpTargetSummary[],
  options: MatchCdpTargetOptions
): CdpTargetSummary | undefined {
  const pageTargets = targets.filter(
    (target) => target.type === 'page' && target.webSocketDebuggerUrl
  )

  if (options.url) {
    const exact = pageTargets.find((target) => target.url === options.url)
    if (exact) {
      return exact
    }
  }

  if (options.targetUrlPattern) {
    const pattern = options.targetUrlPattern

    return pageTargets.find((target) =>
      typeof pattern === 'string'
        ? target.url.includes(pattern)
        : pattern.test(target.url)
    )
  }

  return pageTargets[0]
}
