/**
 * Console 参数引用表保存日志中的复杂对象，供 MCP 后续按需 inspect。
 *
 * 日志采集阶段只分配 ID，不读取对象字段；这样可以避免 Vue vnode、reactive proxy
 * 或组件实例在 `Object.keys()` 阶段触发新的开发模式 warn。
 */
import { nanoid } from 'nanoid'
import type {
  ConsoleArgReference,
  RuntimeConsoleArgInspectRequest,
  RuntimeConsoleArgInspectResult
} from '../types'
import { createBoundedPreview } from '../shared/serialization'

/** Console 对象引用 ID 前缀，用于和普通字符串参数区分。 */
const CONSOLE_ARG_ID_PREFIX = 'console-arg-'
/** 浏览器端最多保留的对象引用数量，避免长时间开发会话无限持有页面对象。 */
const MAX_CONSOLE_ARG_REFERENCES = 200

const consoleArgReferences = new Map<string, unknown>()

/**
 * 注册一个复杂 console 参数。
 *
 * 该函数不读取对象字段，只保存引用并返回可序列化的 ID 标签。
 */
export function registerConsoleArg(value: object): ConsoleArgReference {
  const argId = `${CONSOLE_ARG_ID_PREFIX}${nanoid()}`
  const kind = Array.isArray(value) ? 'array' : 'object'
  const label = `[${kind === 'array' ? 'Array' : 'Object'}:${argId}]`

  consoleArgReferences.set(argId, value)
  trimConsoleArgReferences()

  return { type: 'object', kind, argId, label }
}

/**
 * 按需读取指定 console 对象引用。
 *
 * 只有 AI 明确请求 inspect 时才执行有界快照，避免每条日志自动遍历复杂对象。
 */
export function inspectConsoleArg(
  request: RuntimeConsoleArgInspectRequest
): RuntimeConsoleArgInspectResult {
  if (!consoleArgReferences.has(request.argId)) {
    return {
      ok: false,
      argId: request.argId,
      error: 'Console object reference not found or expired'
    }
  }

  return {
    ok: true,
    argId: request.argId,
    preview: createBoundedPreview(consoleArgReferences.get(request.argId), {
      maxDepth: request.maxDepth,
      maxKeys: request.maxKeys,
      maxArrayItems: request.maxArrayItems,
      maxStringLength: request.maxStringLength,
      maxTotalNodes: request.maxTotalNodes
    })
  }
}

/** 清理最早写入的引用，保证对象引用表容量有上界。 */
function trimConsoleArgReferences(): void {
  while (consoleArgReferences.size > MAX_CONSOLE_ARG_REFERENCES) {
    const [oldestArgId] = consoleArgReferences.keys()
    if (!oldestArgId) {
      return
    }

    consoleArgReferences.delete(oldestArgId)
  }
}
