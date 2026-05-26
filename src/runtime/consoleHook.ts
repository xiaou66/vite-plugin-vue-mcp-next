/**
 * Console Hook 负责在页面内采集早期日志和 CDP 不可用时的兜底日志。
 *
 * 这里所有处理都发生在用户页面主线程，因此必须避免无界遍历和高频日志风暴拖慢页面。
 */

import { nanoid } from 'nanoid'
import { safeStringify } from '../shared/serialization'
import type { ConsoleRecord } from '../types'
import { registerConsoleArg } from './consoleArgRegistry'

/** 单条 console message 最多保留的字符数，超出则丢弃 args 只保留截断文本。 */
const MAX_MESSAGE_CHAR_LENGTH = 5_000
/** 同级别、同 message 前缀的最大连续重复次数，超出后跳过直到冷却。 */
const MAX_CONSECUTIVE_DUPLICATES = 50
/** 重复日志冷却期间最多计数的跳过条数，摘要中用 `+` 表示仍有更多。 */
const MAX_SKIPPED_COUNT = 500
/** 生成去重 key 时最多采样的参数个数，避免多参数日志产生额外遍历成本。 */
const DEDUPE_ARG_SAMPLE_COUNT = 3
/** 去重 key 中字符串片段的最大字符数，防止长字符串本身成为性能问题。 */
const DEDUPE_STRING_PREFIX_LENGTH = 80
/** 上报 args 时最多保留的参数个数，避免一次 warn 携带大量对象形成传输压力。 */
const MAX_ARGUMENT_PREVIEW_COUNT = 3

/**
 * 连续重复日志的运行时状态。
 *
 * 只保存上一类日志，确保限流语义是“连续重复”，而不是按历史累计误吞后续日志。
 */
interface DuplicateState {
  /** 当前连续日志的轻量判等 key，不包含完整原始参数。 */
  readonly key: string
  /** 当前连续日志的级别，摘要记录需要沿用原级别方便 MCP 过滤。 */
  readonly level: ConsoleRecord['level']
  /** 面向摘要输出的可读标签，避免把内部签名直接暴露给调用方。 */
  readonly label: string
  /** 当前连续日志已放行的数量，超过预算后开始抑制。 */
  count: number
  /** 当前连续日志已跳过的数量，达到上限后只保留 capped 计数。 */
  skipped: number
}

interface ConsolePayload {
  readonly message: string
  readonly args: unknown[]
}

interface ConsoleArgEntry {
  readonly message: string
  readonly preview: unknown
}

/**
 * Console Hook 安装参数。
 *
 * Hook 运行在浏览器页面内，需要通过 send 回调交给 Vite WebSocket，而不是直接依赖服务器模块。
 */
export interface ConsoleHookOptions {
  /** 当前页面 ID，用于服务端区分多页面日志来源。 */
  readonly pageId: string
  /** 发送规范化日志记录的回调，由 runtime client 绑定到 Vite WebSocket。 */
  readonly send: (record: ConsoleRecord) => void
}

/**
 * 安装页面 Console 和错误 Hook。
 *
 * 即使启用 CDP，也保留该 Hook，因为早期日志可能发生在 CDP target 匹配完成之前。
 */
export function installConsoleHook(options: ConsoleHookOptions): () => void {
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  }

  let duplicateState: DuplicateState | undefined

  const emit = (level: ConsoleRecord['level'], args: unknown[]): void => {
    const dedupe = createDedupeInfo(level, args)
    if (duplicateState?.key === dedupe.key) {
      duplicateState.count++
      if (duplicateState.count > MAX_CONSECUTIVE_DUPLICATES) {
        duplicateState.skipped = Math.min(
          duplicateState.skipped + 1,
          MAX_SKIPPED_COUNT
        )
        return
      }
    } else {
      flushSuppressedSummary(options, duplicateState)
      duplicateState = {
        key: dedupe.key,
        level,
        label: dedupe.label,
        count: 1,
        skipped: 0
      }
    }

    const payload = createConsolePayload(args)

    options.send({
      id: nanoid(),
      pageId: options.pageId,
      source: 'hook',
      level,
      message: payload.message,
      args: payload.args,
      timestamp: Date.now()
    })
  }

  ;(['log', 'info', 'warn', 'error', 'debug'] as const).forEach((level) => {
    console[level] = (...args: unknown[]) => {
      emit(level, args)
      originalConsole[level](...args)
    }
  })

  const onError = (event: ErrorEvent): void => {
    options.send({
      id: nanoid(),
      pageId: options.pageId,
      source: 'hook',
      level: 'error',
      message: event.message,
      stack: event.error instanceof Error ? event.error.stack : undefined,
      timestamp: Date.now()
    })
  }

  window.addEventListener('error', onError)

  return () => {
    flushSuppressedSummary(options, duplicateState)
    duplicateState = undefined
    Object.assign(console, originalConsole)
    window.removeEventListener('error', onError)
  }
}

/**
 * 创建用于连续重复判断的轻量信息。
 *
 * 该签名只服务于限流，不追求还原日志内容；它最多采样少量参数和字段，避免先于真正序列化触发高成本遍历。
 */
function createDedupeInfo(
  level: ConsoleRecord['level'],
  args: unknown[]
): { key: string; label: string } {
  const signatures = args
    .slice(0, DEDUPE_ARG_SAMPLE_COUNT)
    .map((arg) => createValueSignature(arg))
  const key = `${level}:${signatures.join('|')}`
  const label = createDedupeLabel(args, signatures)

  return { key, label }
}

/**
 * 创建面向 MCP 输出的重复日志摘要标签。
 *
 * label 不参与判等，因此优先可读性；字符串首参直接展示内容，其他类型再退回轻量签名。
 */
function createDedupeLabel(args: unknown[], signatures: string[]): string {
  const [firstArg] = args
  if (typeof firstArg === 'string') {
    return sliceDedupeString(firstArg)
  }

  return signatures.join(' ') || '[empty]'
}

/**
 * 创建带预算的日志文本，并判断是否还应保留结构化 args。
 *
 * 对象参数只输出类型标签，避免 Vue reactive、vnode 或组件实例在 key 枚举时触发新的 warn。
 */
function createConsolePayload(args: unknown[]): ConsolePayload {
  const entries = args.map(createArgEntry)
  const rawMessage = entries.map((entry) => entry.message).join(' ')
  const oversizedInput = args.some(isOversizedString)
  const oversizedMessage = rawMessage.length > MAX_MESSAGE_CHAR_LENGTH
  const message = oversizedMessage
    ? `${rawMessage.slice(0, MAX_MESSAGE_CHAR_LENGTH)}[Truncated]`
    : rawMessage
  const includeArgs = !oversizedInput && !oversizedMessage

  return {
    message,
    args: includeArgs
      ? entries
          .slice(0, MAX_ARGUMENT_PREVIEW_COUNT)
          .map((entry) => entry.preview)
      : []
  }
}

/**
 * 创建 console 参数的展示文本和结构化预览。
 *
 * 对象只注册一次引用，message 和 args 复用同一个 argId，避免 AI 根据日志标签继续 inspect 时拿到错位对象。
 */
function createArgEntry(value: unknown): ConsoleArgEntry {
  if (typeof value === 'string') {
    return {
      message: truncateMessageString(value),
      preview: value
    }
  }

  if (value && typeof value === 'object') {
    const reference = registerConsoleArg(value)

    return {
      message: reference.label,
      preview: reference
    }
  }

  const preview = createPrimitivePreview(value)

  return {
    message: safeStringify(value),
    preview
  }
}

/**
 * 创建上报给 MCP 的基础类型参数预览。
 *
 * 对象必须在 createArgEntry 中提前处理，避免误走基础类型分支后丢失引用 ID。
 */
function createPrimitivePreview(value: unknown): unknown {
  if (value === null) {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value)
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'symbol') {
    return value.description ? `[Symbol(${value.description})]` : '[Symbol]'
  }

  if (typeof value === 'function') {
    return value.name ? `[Function:${value.name}]` : '[Function]'
  }

  return value
}

/**
 * 发送重复日志摘要。
 *
 * 连续重复日志被跳过时，摘要能让 MCP 调用方知道发生过日志风暴，而不是误以为页面没有继续输出。
 */
function flushSuppressedSummary(
  options: ConsoleHookOptions,
  state: DuplicateState | undefined
): void {
  if (!state || state.skipped === 0) {
    return
  }

  const skipped =
    state.skipped >= MAX_SKIPPED_COUNT
      ? `${String(MAX_SKIPPED_COUNT)}+`
      : String(state.skipped)

  options.send({
    id: nanoid(),
    pageId: options.pageId,
    source: 'hook',
    level: state.level,
    message: `Suppressed ${skipped} duplicate ${state.level} logs: ${state.label}`,
    args: [],
    timestamp: Date.now()
  })
}

/**
 * 为未知值创建浅层签名。
 *
 * 对象只使用标签，不做 key 枚举或属性读取，避免 Vue Proxy 在 console hook 内再次触发 warn。
 */
function createValueSignature(value: unknown): string {
  if (value && typeof value === 'object') {
    return createObjectTypeLabel(value)
  }

  return createPrimitiveSignature(value)
}

/**
 * 创建对象标签。
 *
 * 只用 `Array.isArray()` 区分数组，其余对象统一标记，避免 `Object.keys()` 和属性读取触发用户代码。
 */
function createObjectTypeLabel(value: object): string {
  if (Array.isArray(value)) {
    return '[Array]'
  }

  return '[Object]'
}

/**
 * 基本类型签名用于区分常见日志内容。
 *
 * 对象类型在这里不展开，调用方需要先走对象专用分支。
 */
function createPrimitiveSignature(value: unknown): string {
  if (typeof value === 'string') {
    return `string:${sliceDedupeString(value)}`
  }

  if (value === null) {
    return 'null'
  }

  switch (typeof value) {
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'undefined':
      return `${typeof value}:${String(value)}`
    case 'symbol':
      return value.description
        ? `symbol:${sliceDedupeString(value.description)}`
        : 'symbol'
    case 'function':
      return value.name ? `function:${sliceDedupeString(value.name)}` : 'function'
    case 'object':
      return `object:${Object.prototype.toString.call(value)}`
    default:
      return 'unknown'
  }
}

/** 判断原始参数中是否包含明显超出预算的字符串。 */
function isOversizedString(value: unknown): boolean {
  return typeof value === 'string' && value.length > MAX_MESSAGE_CHAR_LENGTH
}

/** 截断直接来自 console 的长字符串，保证 message 构建本身有上界。 */
function truncateMessageString(value: string): string {
  if (value.length <= MAX_MESSAGE_CHAR_LENGTH) {
    return value
  }

  return `${value.slice(0, MAX_MESSAGE_CHAR_LENGTH)}[Truncated]`
}

/** 截取用于去重 key 的短字符串片段。 */
function sliceDedupeString(value: string): string {
  return value.slice(0, DEDUPE_STRING_PREFIX_LENGTH)
}
