/**
 * 文本截断结果。
 *
 * MCP 输出需要明确告诉调用方内容被截断，否则 AI 可能误以为看到的是完整响应。
 */
export interface TruncatedText {
  /** 截断后的文本。 */
  readonly text: string
  /** 是否发生截断。 */
  readonly truncated: boolean
  /** 原始文本长度，用于判断丢失信息规模。 */
  readonly originalLength: number
}

/**
 * 截断长文本。
 *
 * DOM 文本和响应体都可能很大，统一截断策略可以避免不同工具输出行为不一致。
 */
export function truncateText(text: string, maxLength: number): TruncatedText {
  if (text.length <= maxLength) {
    return { text, truncated: false, originalLength: text.length }
  }

  return {
    text: text.slice(0, maxLength),
    truncated: true,
    originalLength: text.length
  }
}

/**
 * 对敏感 header 做脱敏。
 *
 * Network 调试需要展示 header，但认证和 Cookie 不应原样暴露给 AI 客户端。
 */
export function maskHeaders(
  headers: Record<string, string> = {},
  maskNames: readonly string[] = []
): Record<string, string> {
  const normalizedMaskNames = new Set(
    maskNames.map((name) => name.toLowerCase())
  )

  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      normalizedMaskNames.has(name.toLowerCase()) ? '[masked]' : value
    ])
  )
}
