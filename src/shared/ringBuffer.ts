/**
 * 提供固定容量的内存缓存。
 *
 * Console 和 Network 都是持续增长的数据源，使用环形缓存可以保证开发服务器长时间运行时
 * 内存占用仍然可控，同时保留最近的调试上下文。
 */
export interface RingBuffer<T> {
  /** 写入一条新记录，超过容量时会丢弃最早记录。 */
  push(value: T): void
  /** 返回按时间顺序排列的缓存快照，避免调用方直接修改内部数组。 */
  all(): T[]
  /** 清空缓存，适合 MCP clear 类工具使用。 */
  clear(): void
}

/**
 * 创建固定容量缓存。
 *
 * 这里不用外部依赖，避免核心调试缓存被复杂数据结构绑死。
 */
export function createRingBuffer<T>(capacity: number): RingBuffer<T> {
  const items: T[] = []

  return {
    push(value) {
      items.push(value)
      while (items.length > capacity) {
        items.shift()
      }
    },
    all() {
      return [...items]
    },
    clear() {
      items.length = 0
    }
  }
}
