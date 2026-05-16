/**
 * 运行时脚本执行请求。
 *
 * Hook fallback 仅支持表达式风格执行，复杂语句执行优先交给 CDP adapter。
 */
export interface RuntimeEvaluateRequest {
  /** 需要执行的表达式。 */
  readonly expression: string
  /** 是否等待 Promise 结果，默认由调用方决定。 */
  readonly awaitPromise?: boolean
  /** 执行超时时间，避免页面长任务阻塞调试链路。 */
  readonly timeoutMs: number
}

/**
 * 执行表达式风格脚本。
 *
 * 使用 Function 构造器而不是直接 eval，可以明确限定为表达式返回值；
 * 语句级调试留给 CDP Runtime.evaluate，以减少 Hook fallback 的行为边界。
 */
export async function evaluateExpression(
  request: RuntimeEvaluateRequest
): Promise<unknown> {
  const value = runExpression(request.expression)
  const result =
    request.awaitPromise === false ? value : await Promise.resolve(value)

  return Promise.race([
    Promise.resolve(result),
    createTimeout(request.timeoutMs)
  ])
}

/**
 * 执行表达式并返回结果。
 *
 * 这里必须动态执行用户传入表达式，但 MCP 工具默认关闭该能力，只有用户显式配置
 * `runtime.evaluate.enabled` 后才会暴露入口；因此把例外集中在该函数，便于后续安全审查。
 */
function runExpression(expression: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- evaluate_script 的职责就是执行显式授权后的调试表达式。
  return new Function(`return (${expression})`)() as unknown
}

/**
 * 创建执行超时 Promise。
 *
 * 控制台执行必须有硬边界，否则 MCP 调用可能被页面内长任务永久挂起。
 */
function createTimeout(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => {
      reject(
        new Error(`evaluate_script timed out after ${String(timeoutMs)}ms`)
      )
    }, timeoutMs)
  })
}
