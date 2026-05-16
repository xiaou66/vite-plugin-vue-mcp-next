/**
 * 将未知值转换为适合 MCP 文本输出的字符串。
 *
 * Console 参数、脚本执行结果和 Network body 都可能包含循环引用，统一序列化能避免工具调用崩溃。
 */
export function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  const seen = new WeakSet()

  const serialized = JSON.stringify(
    value,
    (_key: string, current: unknown): unknown => {
      if (typeof current !== 'object' || current === null) {
        return current
      }

      if (seen.has(current)) {
        return '[Circular]'
      }

      seen.add(current)
      return current
    }
  )

  return serialized
}
