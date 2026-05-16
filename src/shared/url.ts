/**
 * 解析请求 URL 中的 query 参数。
 *
 * Network 工具需要直接回答“请求参数是什么”，将 query 拆成结构化对象可以减少 AI 重复解析。
 */
export function parseRequestQuery(
  url: string
): Record<string, string | string[]> {
  const parsed = new URL(url, 'http://vite-plugin-vue-mcp-next.local')
  const queryEntries = new Map<string, string | string[]>()

  for (const [key, value] of parsed.searchParams.entries()) {
    const existing = queryEntries.get(key)

    if (existing === undefined) {
      queryEntries.set(key, value)
      continue
    }

    if (Array.isArray(existing)) {
      existing.push(value)
      continue
    }

    queryEntries.set(key, [existing, value])
  }

  return Object.fromEntries(queryEntries)
}

/**
 * 获取 URL pathname。
 *
 * 页面 target 可能上报绝对 URL 或相对路径，该 helper 让展示逻辑不需要关心来源格式。
 */
export function safeUrlPathname(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url.split('?')[0] || '/'
  }
}
