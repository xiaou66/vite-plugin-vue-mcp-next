import type CDP from 'chrome-remote-interface'

/**
 * 通过 CDP 获取 DOM 快照。
 *
 * CDP DOMSnapshot 更接近 DevTools 视角，配置了 CDP 时应优先使用它获取通用 DOM 能力。
 */
export async function cdpGetDomSnapshot(client: CDP.Client): Promise<unknown> {
  await client.DOMSnapshot.enable()

  return client.DOMSnapshot.captureSnapshot({
    computedStyles: []
  })
}

/**
 * 通过 CDP 查询 DOM。
 *
 * 使用 Runtime.evaluate 可以复用浏览器 selector 行为，并返回轻量可序列化摘要。
 */
export async function cdpQueryDom(
  client: CDP.Client,
  selector: string,
  limit: number
): Promise<unknown> {
  const expression = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).slice(0, ${String(limit)}).map((el) => ({ tag: el.tagName.toLowerCase(), text: el.textContent?.trim() || '', attrs: Object.fromEntries(Array.from(el.attributes).map((attr) => [attr.name, attr.value])), rect: el.getBoundingClientRect().toJSON() }))`
  const result = await client.Runtime.evaluate({
    expression,
    returnByValue: true
  })

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'CDP query DOM failed')
  }

  return result.result.value
}
