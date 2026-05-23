/**
 * 插件运行时共享上下文。
 *
 * 该文件集中维护 MCP 工具、Runtime Bridge 与 CDP Adapter 共用的状态容器，
 * 避免页面、日志和网络缓存分散在各工具模块后出现生命周期不一致。
 */
import { createHooks } from 'hookable'
import { createRingBuffer } from './shared/ringBuffer'
import { DEFAULT_PERFORMANCE_MAX_REPORTS } from './constants'
import type {
  ConsoleRecord,
  NetworkRecord,
  PageTarget,
  PageTargetListOptions,
  PageTargetRegistry,
  ResolvedVueMcpNextOptions,
  PerformanceReport,
  PerformanceSession,
  VueMcpNextContext
} from './types'

/** 一分钟毫秒数，用于声明 runtime 断开记录保留窗口。 */
const MINUTE_MS = 60 * 1000
/** 断开的 runtime 页面只短期保留，避免长期开发会话不断累积历史目标。 */
const DISCONNECTED_RUNTIME_TARGET_RETENTION_MS = 5 * MINUTE_MS

/**
 * 判断断开的 runtime 目标是否已经超过保留窗口。
 *
 * 只清理 runtime 历史记录，避免 CDP target 因浏览器临时状态被插件侧误删。
 */
function shouldPruneDisconnectedRuntimeTarget(
  target: PageTarget,
  now: number
): boolean {
  return (
    target.source === 'runtime' &&
    !target.connected &&
    typeof target.disconnectedAt === 'number' &&
    now - target.disconnectedAt > DISCONNECTED_RUNTIME_TARGET_RETENTION_MS
  )
}

/**
 * 清理过期的断开 runtime 目标。
 *
 * registry 的公开操作都会调用该函数，让页面列表长期使用时不会无限保留刷新历史。
 */
function pruneDisconnectedRuntimeTargets(
  targets: Map<string, PageTarget>,
  now: number
): void {
  for (const [pageId, target] of targets) {
    if (shouldPruneDisconnectedRuntimeTarget(target, now)) {
      targets.delete(pageId)
    }
  }
}

/**
 * 标记页面目标断开。
 *
 * 断开时间只在从 connected 变为 disconnected 时写入，避免重复 disconnect 延长过期记录寿命。
 */
function markTargetDisconnected(target: PageTarget, now: number): PageTarget {
  return {
    ...target,
    connected: false,
    disconnectedAt: target.disconnectedAt ?? now
  }
}

/**
 * 判断页面目标是否应出现在日常页面列表中。
 *
 * 默认只隐藏断开的 runtime 历史记录；CDP target 是否可连由 CDP 返回值表达，不在这里裁剪。
 */
function shouldListPageTarget(
  target: PageTarget,
  options: PageTargetListOptions
): boolean {
  return (
    options.includeDisconnected === true ||
    target.source !== 'runtime' ||
    target.connected
  )
}

/**
 * 断开同一浏览器标签页的旧 runtime 目标。
 *
 * runtime 刷新或 HMR 重连会产生新的 pageId，但同一个 sessionStorage client id 代表同一标签页；
 * 保留旧记录为 disconnected 可以解释历史目标，同时避免 `list_pages` 出现多个可操作的重复页面。
 */
function disconnectPreviousRuntimeClientTarget(
  targets: Map<string, PageTarget>,
  target: PageTarget,
  now: number
): void {
  if (target.source !== 'runtime' || !target.runtimeClientId) {
    return
  }

  for (const [pageId, currentTarget] of targets) {
    if (
      pageId === target.pageId ||
      currentTarget.source !== 'runtime' ||
      currentTarget.runtimeClientId !== target.runtimeClientId ||
      !currentTarget.connected
    ) {
      continue
    }

    targets.set(pageId, markTargetDisconnected(currentTarget, now))
  }
}

/**
 * 创建页面目标注册表。
 *
 * 独立工厂便于单元测试，也避免上下文对象承担过多数据结构细节。
 */
export function createPageTargetRegistry(): PageTargetRegistry {
  const targets = new Map<string, PageTarget>()

  return {
    upsert(target, now = Date.now()) {
      pruneDisconnectedRuntimeTargets(targets, now)
      disconnectPreviousRuntimeClientTarget(targets, target, now)
      targets.set(target.pageId, target)
    },
    get(pageId) {
      return targets.get(pageId)
    },
    list(options = {}) {
      const now = options.now ?? Date.now()
      pruneDisconnectedRuntimeTargets(targets, now)

      return [...targets.values()].filter((target) =>
        shouldListPageTarget(target, options)
      )
    },
    disconnect(pageId, now = Date.now()) {
      pruneDisconnectedRuntimeTargets(targets, now)
      const target = targets.get(pageId)

      if (!target) {
        return
      }

      targets.set(pageId, markTargetDisconnected(target, now))
    }
  }
}

/**
 * 创建插件运行时上下文。
 *
 * MCP、Runtime Bridge 和 CDP Adapter 都需要共享页面、日志和网络状态，
 * 但这些状态不应该散落在各工具文件里，否则工具之间会出现不一致。
 */
export function createVueMcpNextContext(
  options: ResolvedVueMcpNextOptions
): VueMcpNextContext {
  return {
    options,
    hooks: createHooks(),
    rpcServer: undefined,
    pages: createPageTargetRegistry(),
    consoleRecords: createRingBuffer<ConsoleRecord>(options.console.maxRecords),
    networkRecords: createRingBuffer<NetworkRecord>(options.network.maxRecords),
    performanceReports: createRingBuffer<PerformanceReport>(
      DEFAULT_PERFORMANCE_MAX_REPORTS
    ),
    performanceSessions: new Map<string, PerformanceSession>()
  }
}
