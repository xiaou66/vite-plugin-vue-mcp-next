import { createHooks } from 'hookable'
import { createRingBuffer } from './shared/ringBuffer'
import type {
  ConsoleRecord,
  NetworkRecord,
  PageTarget,
  PageTargetRegistry,
  ResolvedVueMcpNextOptions,
  VueMcpNextContext
} from './types'

/**
 * 创建页面目标注册表。
 *
 * 独立工厂便于单元测试，也避免上下文对象承担过多数据结构细节。
 */
export function createPageTargetRegistry(): PageTargetRegistry {
  const targets = new Map<string, PageTarget>()

  return {
    upsert(target) {
      targets.set(target.pageId, target)
    },
    get(pageId) {
      return targets.get(pageId)
    },
    list() {
      return [...targets.values()]
    },
    disconnect(pageId) {
      const target = targets.get(pageId)

      if (!target) {
        return
      }

      targets.set(pageId, { ...target, connected: false })
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
    networkRecords: createRingBuffer<NetworkRecord>(options.network.maxRecords)
  }
}
