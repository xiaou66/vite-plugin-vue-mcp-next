import type { VueRuntimeRpc } from '../types'
import { createDomSnapshot, queryDomElements } from './domSnapshot'
import { evaluateExpression } from './evaluateExpression'

/**
 * 创建通用 Runtime DevTools RPC。
 *
 * 这些能力是 CDP 不可用时的 Hook fallback，和 Vue 专属能力放在同一条 Vite RPC 通道里，
 * 可以避免再维护第二套浏览器到服务端的请求协议。
 */
export function createRuntimeDevtoolsRpc(
  getRpc: () => VueRuntimeRpc
): Pick<
  VueRuntimeRpc,
  | 'getDomTree'
  | 'onDomTreeUpdated'
  | 'queryDom'
  | 'onDomQueryUpdated'
  | 'evaluateScript'
  | 'onEvaluateScriptUpdated'
> {
  return {
    getDomTree(options) {
      getRpc().onDomTreeUpdated(
        options.event,
        createDomSnapshot(document.documentElement, {
          maxDepth: options.maxDepth,
          maxNodes: options.maxNodes,
          maxTextLength: options.maxTextLength
        })
      )
    },
    onDomTreeUpdated: () => undefined,
    queryDom(options) {
      getRpc().onDomQueryUpdated(
        options.event,
        queryDomElements(options.selector, options.limit)
      )
    },
    onDomQueryUpdated: () => undefined,
    async evaluateScript(options) {
      try {
        getRpc().onEvaluateScriptUpdated(options.event, {
          ok: true,
          value: await evaluateExpression(options)
        })
      } catch (error) {
        getRpc().onEvaluateScriptUpdated(options.event, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    },
    onEvaluateScriptUpdated: () => undefined
  }
}
