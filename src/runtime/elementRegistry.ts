/**
 * 页面级元素 registry。
 *
 * 该 registry 只保存当前页面生命周期内的 DOM 引用，用于 runtime fallback ID；
 * 它不跨刷新、不持久化，避免 AI 使用已经失效的 DOM 节点继续修改页面。
 */

import { nanoid } from 'nanoid'

const RUNTIME_ELEMENT_ID_PREFIX = 'runtime:vmcp_'
const RUNTIME_ELEMENT_ID_SIZE = 8

/**
 * runtime 元素记录。
 *
 * `createdAt` 用于后续排查生命周期问题，不表示该 ID 可跨刷新复用。
 */
export interface RuntimeElementRecord {
  readonly elementId: string
  readonly element: Element
  readonly createdAt: number
}

/**
 * runtime 元素 registry。
 *
 * register 会为无源码 ID 的元素创建短 ID；clear 在页面生命周期结束或测试中释放引用。
 */
export interface RuntimeElementRegistry {
  register(element: Element): string
  get(elementId: string): RuntimeElementRecord | undefined
  clear(): void
}

/**
 * 浏览器页面默认 registry。
 *
 * picker 和 runtime context resolver 必须共享同一个 registry，动态 DOM 的 runtime ID 才能被 MCP 查询回来。
 */
export const runtimeElementRegistry = createRuntimeElementRegistry()

/**
 * 创建运行时短 ID。
 *
 * 运行时 ID 只在当前页面生命周期内有效，前缀必须清楚表达它不能跨刷新复用。
 */
export function createRuntimeElementId(): string {
  return `${RUNTIME_ELEMENT_ID_PREFIX}${nanoid(RUNTIME_ELEMENT_ID_SIZE)}`
}

/**
 * 创建页面级元素 registry。
 *
 * registry 不持久化到服务端，避免页面刷新后 AI 误用旧 DOM 节点。
 */
export function createRuntimeElementRegistry(): RuntimeElementRegistry {
  const records = new Map<string, RuntimeElementRecord>()

  return {
    register(element) {
      const elementId = createRuntimeElementId()
      records.set(elementId, {
        elementId,
        element,
        createdAt: Date.now()
      })
      return elementId
    },
    get(elementId) {
      return records.get(elementId)
    },
    clear() {
      records.clear()
    }
  }
}
