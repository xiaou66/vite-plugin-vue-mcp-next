import type CDP from 'chrome-remote-interface'

/**
 * CDP 脚本执行参数。
 *
 * 通过 CDP Runtime.evaluate 执行脚本更接近浏览器 DevTools Console 行为。
 */
export interface CdpEvaluateOptions {
  /** 已连接的 CDP client。 */
  readonly client: CDP.Client
  /** 要执行的表达式。 */
  readonly expression: string
  /** 是否等待 Promise 结果，适合调试异步页面状态。 */
  readonly awaitPromise?: boolean
}

/**
 * 使用 CDP 执行控制台表达式。
 *
 * 该能力只在用户显式开启 evaluate_script 后可用，避免默认暴露高风险操作。
 */
export async function cdpEvaluate(
  options: CdpEvaluateOptions
): Promise<unknown> {
  const result = await options.client.Runtime.evaluate({
    expression: options.expression,
    awaitPromise: options.awaitPromise ?? true,
    returnByValue: true
  })

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'CDP evaluate failed')
  }

  return result.result.value
}
