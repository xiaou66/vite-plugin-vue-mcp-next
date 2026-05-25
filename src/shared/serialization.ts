/**
 * 共享序列化工具负责把未知运行时值转换成可读、可传输的小型快照。
 *
 * 这里不能对未知对象做无界递归，也不能直接依赖 `JSON.stringify()` 处理对象；
 * Vue reactive、DevTools Proxy 或组件实例都可能在属性读取或 `toJSON` 阶段触发副作用。
 */

/** 快照预算选项，用于控制浏览器主线程上的最坏遍历成本。 */
export interface BoundedPreviewOptions {
  /** 最大递归深度，防止深入 vnode、component instance 或 reactive graph。 */
  readonly maxDepth?: number
  /** 单个对象最多读取的自有可枚举字符串键数量。 */
  readonly maxKeys?: number
  /** 单个数组最多读取的元素数量。 */
  readonly maxArrayItems?: number
  /** 单个字符串最多保留的字符数。 */
  readonly maxStringLength?: number
  /** 单次快照最多访问的对象或数组节点数量。 */
  readonly maxTotalNodes?: number
}

/** 快照输出保持 JSON 兼容，避免再次穿过 HMR/RPC 时触发序列化异常。 */
export type BoundedPreviewValue =
  | string
  | number
  | boolean
  | null
  | BoundedPreviewValue[]
  | { [key: string]: BoundedPreviewValue }

const DEFAULT_PREVIEW_OPTIONS: Required<BoundedPreviewOptions> = {
  maxDepth: 2,
  maxKeys: 20,
  maxArrayItems: 20,
  maxStringLength: 1000,
  maxTotalNodes: 200
}

const CIRCULAR_VALUE = '[Circular]'
const TRUNCATED_VALUE = '[Truncated]'
const UNREADABLE_VALUE = '[Unreadable]'

type PreviewFunction = (...args: never[]) => unknown

interface PreviewContext {
  readonly options: Required<BoundedPreviewOptions>
  readonly seen: WeakSet<object>
  visited: number
}

/**
 * 创建有预算的可传输快照。
 *
 * 该函数只读取自有可枚举字符串键，显式跳过 `toJSON`，适合在 HMR/RPC 出站前
 * 把 console 参数等未知对象降级为诊断快照。
 */
export function createBoundedPreview(
  value: unknown,
  options: BoundedPreviewOptions = {}
): BoundedPreviewValue | undefined {
  return previewValue(
    value,
    {
      options: { ...DEFAULT_PREVIEW_OPTIONS, ...options },
      seen: new WeakSet(),
      visited: 0
    },
    0,
    false
  )
}

/**
 * 将未知值转换为适合 MCP 文本输出的字符串。
 *
 * Console 参数、脚本执行结果和 Network body 都可能包含循环引用；先做有预算快照，
 * 再交给 JSON 序列化，可以避免工具调用或 HMR 发送阶段崩溃。
 */
export function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return truncateString(value, DEFAULT_PREVIEW_OPTIONS.maxStringLength)
  }

  const preview = createBoundedPreview(value)
  if (preview === undefined) {
    return 'undefined'
  }

  return JSON.stringify(preview)
}

function previewValue(
  value: unknown,
  context: PreviewContext,
  depth: number,
  arrayItem: boolean
): BoundedPreviewValue | undefined {
  if (value === null) {
    return null
  }

  switch (typeof value) {
    case 'string':
      return truncateString(value, context.options.maxStringLength)
    case 'number':
      return Number.isFinite(value) ? value : String(value)
    case 'boolean':
      return value
    case 'bigint':
      return value.toString()
    case 'symbol':
      return value.description ? `[Symbol(${value.description})]` : '[Symbol]'
    case 'function':
      return functionLabel(value as PreviewFunction)
    case 'undefined':
      return arrayItem ? null : undefined
    case 'object':
      return previewObject(value, context, depth)
    default:
      return arrayItem ? null : undefined
  }
}

function previewObject(
  value: object,
  context: PreviewContext,
  depth: number
): BoundedPreviewValue {
  if (context.seen.has(value)) {
    return CIRCULAR_VALUE
  }

  if (context.visited >= context.options.maxTotalNodes) {
    return TRUNCATED_VALUE
  }

  if (depth >= context.options.maxDepth) {
    return objectLabel(value)
  }

  context.visited += 1
  context.seen.add(value)

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString()
  }

  if (value instanceof Error) {
    return previewError(value, context, depth)
  }

  if (Array.isArray(value)) {
    return previewArray(value, context, depth)
  }

  if (isElementLike(value)) {
    return elementLabel(value)
  }

  return previewRecord(value, context, depth)
}

function previewArray(
  values: unknown[],
  context: PreviewContext,
  depth: number
): BoundedPreviewValue[] {
  const result = values
    .slice(0, context.options.maxArrayItems)
    .map((item) => previewValue(item, context, depth + 1, true) ?? null)

  if (values.length > context.options.maxArrayItems) {
    result.push(TRUNCATED_VALUE)
  }

  return result
}

function previewRecord(
  value: object,
  context: PreviewContext,
  depth: number
): BoundedPreviewValue {
  const keys = enumerableKeys(value)
  if (!keys) {
    return UNREADABLE_VALUE
  }

  const result: { [key: string]: BoundedPreviewValue } = {}
  const limitedKeys = keys.filter((key) => key !== 'toJSON')

  limitedKeys.slice(0, context.options.maxKeys).forEach((key) => {
    const field = readField(value, key)
    result[key] = field.ok
      ? previewValue(field.value, context, depth + 1, false) ?? null
      : UNREADABLE_VALUE
  })

  if (limitedKeys.length > context.options.maxKeys) {
    result[TRUNCATED_VALUE] =
      `${String(limitedKeys.length - context.options.maxKeys)} keys omitted`
  }

  return result
}

function previewError(
  error: Error,
  context: PreviewContext,
  depth: number
): BoundedPreviewValue {
  const result: { [key: string]: BoundedPreviewValue } = {
    name: error.name,
    message: truncateString(error.message, context.options.maxStringLength)
  }
  const stack = readField(error, 'stack')

  if (stack.ok && typeof stack.value === 'string') {
    result.stack = truncateString(stack.value, context.options.maxStringLength)
  }

  const cause = readField(error, 'cause')
  if (cause.ok && cause.value !== undefined) {
    result.cause = previewValue(cause.value, context, depth + 1, false) ?? null
  }

  return result
}

function enumerableKeys(value: object): string[] | undefined {
  try {
    return Object.keys(value)
  } catch {
    return undefined
  }
}

function readField(
  value: object,
  key: string
): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: (value as Record<string, unknown>)[key] }
  } catch {
    return { ok: false }
  }
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}${TRUNCATED_VALUE}`
}

function functionLabel(value: PreviewFunction): string {
  return value.name ? `[Function:${value.name}]` : '[Function]'
}

function objectLabel(value: object): string {
  if (Array.isArray(value)) {
    return `[Array(${String(value.length)})]`
  }

  return '[Object]'
}

function isElementLike(value: object): value is {
  readonly nodeType: number
  readonly nodeName: string
  readonly id?: string
  readonly className?: string
} {
  const node = value as Partial<{
    nodeType: unknown
    nodeName: unknown
  }>

  return node.nodeType === 1 && typeof node.nodeName === 'string'
}

function elementLabel(value: {
  readonly nodeName: string
  readonly id?: string
  readonly className?: string
}): string {
  const name = value.nodeName.toLowerCase()
  const id = value.id ? `#${value.id}` : ''
  const className =
    typeof value.className === 'string' && value.className
      ? `.${value.className.trim().replace(/\s+/g, '.')}`
      : ''

  return `[Element:${name}${id}${className}]`
}
