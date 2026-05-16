import { nanoid } from 'nanoid'
import { maskHeaders, truncateText } from '../shared/sanitize'
import { parseRequestQuery } from '../shared/url'
import type { NetworkRecord } from '../types'

/**
 * Hook Network 记录创建参数。
 *
 * 将记录创建抽成纯函数，便于测试脱敏、query 解析和字段标准化。
 */
export interface HookNetworkRecordInput {
  /** 当前页面 ID，用于服务端区分多页面请求来源。 */
  readonly pageId: string
  /** 请求 URL，用于记录接口地址和解析 query 参数。 */
  readonly url: string
  /** HTTP 方法，Hook 会从 fetch init 或 XHR open 中提取。 */
  readonly method: string
  /** 请求头快照，采集前会按 maskHeaders 脱敏。 */
  readonly requestHeaders?: Record<string, string>
  /** 请求体快照，用于调试提交参数。 */
  readonly requestBody?: unknown
  /** 需要脱敏的 header 名称。 */
  readonly maskHeaders: readonly string[]
  /** 请求开始时间，用于后续计算耗时。 */
  readonly startedAt: number
}

/**
 * Network Hook 安装参数。
 *
 * Hook 运行在浏览器页面内，通过 send 回调把记录交给 Vite WebSocket。
 */
export interface NetworkHookOptions {
  /** 当前页面 ID，用于服务端区分多页面请求来源。 */
  readonly pageId: string
  /** 请求体和响应体最大采集长度，避免大响应污染 MCP 上下文。 */
  readonly maxBodySize: number
  /** 需要脱敏的 header 名称。 */
  readonly maskHeaders: readonly string[]
  /** 发送规范化网络记录的回调。 */
  readonly send: (record: NetworkRecord) => void
}

/**
 * 创建 Hook 来源的 Network 记录。
 *
 * Hook 模式只覆盖 fetch/XHR，但它可以零配置提供业务接口的请求参数和响应值。
 */
export function createHookNetworkRecord(
  input: HookNetworkRecordInput
): NetworkRecord {
  return {
    id: nanoid(),
    pageId: input.pageId,
    source: 'hook',
    url: input.url,
    method: input.method,
    requestHeaders: maskHeaders(input.requestHeaders, input.maskHeaders),
    requestQuery: parseRequestQuery(input.url),
    requestBody: input.requestBody,
    startedAt: input.startedAt
  }
}

/**
 * 安装 fetch 和 XHR 网络 Hook。
 *
 * Hook 不覆盖静态资源和浏览器内部请求，但能在无 CDP 配置时捕获大多数业务接口。
 */
export function installNetworkHook(options: NetworkHookOptions): () => void {
  const originalFetch = window.fetch.bind(window)
  const XMLHttpRequestCtor = window.XMLHttpRequest as
    | typeof XMLHttpRequest
    | undefined
  // eslint-disable-next-line @typescript-eslint/unbound-method -- XHR 原型方法必须保留动态 this，后续通过 Reflect.apply 绑定到具体实例。
  const originalOpen = XMLHttpRequestCtor?.prototype.open
  // eslint-disable-next-line @typescript-eslint/unbound-method -- XHR 原型方法必须保留动态 this，后续通过 Reflect.apply 绑定到具体实例。
  const originalSend = XMLHttpRequestCtor?.prototype.send

  window.fetch = createFetchHook(originalFetch, options)

  if (XMLHttpRequestCtor && originalOpen && originalSend) {
    installXhrHook(XMLHttpRequestCtor, originalOpen, originalSend, options)
  }

  return () => {
    window.fetch = originalFetch
    if (XMLHttpRequestCtor && originalOpen && originalSend) {
      XMLHttpRequestCtor.prototype.open = originalOpen
      XMLHttpRequestCtor.prototype.send = originalSend
    }
  }
}

/**
 * 创建 fetch 包装函数。
 *
 * 使用 response.clone() 读取响应体，避免调试采集破坏业务代码对 response 的消费。
 */
function createFetchHook(
  originalFetch: typeof window.fetch,
  options: NetworkHookOptions
): typeof window.fetch {
  return async (input, init) => {
    const startedAt = Date.now()
    const record = createHookNetworkRecord({
      pageId: options.pageId,
      url: getFetchUrl(input),
      method: getFetchMethod(input, init),
      requestHeaders: headersToRecord(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      ),
      requestBody: init?.body,
      maskHeaders: options.maskHeaders,
      startedAt
    })

    try {
      const response = await originalFetch(input, init)
      const endedAt = Date.now()
      options.send({
        ...record,
        status: response.status,
        responseHeaders: headersToRecord(response.headers),
        responseBody: await readResponseBody(response, options.maxBodySize),
        endedAt,
        durationMs: endedAt - startedAt
      })
      return response
    } catch (error) {
      const endedAt = Date.now()
      options.send({
        ...record,
        error: error instanceof Error ? error.message : String(error),
        endedAt,
        durationMs: endedAt - startedAt
      })
      throw error
    }
  }
}

/**
 * 安装 XHR 包装。
 *
 * XHR 没有 fetch 那样的 clone 能力，因此只读取 responseText，并在失败时静默降级。
 */
function installXhrHook(
  XMLHttpRequestCtor: typeof XMLHttpRequest,
  originalOpen: typeof XMLHttpRequest.prototype.open,
  originalSend: typeof XMLHttpRequest.prototype.send,
  options: NetworkHookOptions
): void {
  const states = new WeakMap<
    XMLHttpRequest,
    { method: string; url: string; startedAt: number; body?: unknown }
  >()

  XMLHttpRequestCtor.prototype.open = function open(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ): void {
    const args = [method, url, async, username, password].filter(
      (item) => item !== undefined
    )
    states.set(this, { method, url: String(url), startedAt: 0 })
    Reflect.apply(originalOpen, this, args)
  }

  XMLHttpRequestCtor.prototype.send = function send(
    this: XMLHttpRequest,
    ...args: Parameters<typeof originalSend>
  ): void {
    const [body] = args
    const state = states.get(this)

    if (state) {
      state.startedAt = Date.now()
      state.body = body
      const record = createHookNetworkRecord({
        pageId: options.pageId,
        url: state.url,
        method: state.method,
        requestBody: body,
        maskHeaders: options.maskHeaders,
        startedAt: state.startedAt
      })
      this.addEventListener('loadend', () => {
        const endedAt = Date.now()
        options.send({
          ...record,
          status: this.status,
          responseHeaders: parseRawHeaders(this.getAllResponseHeaders()),
          responseBody: truncateText(
            safeReadXhrResponseText(this),
            options.maxBodySize
          ).text,
          endedAt,
          durationMs: endedAt - state.startedAt
        })
      })
    }

    Reflect.apply(originalSend, this, args)
  }
}

/**
 * 获取 fetch 请求 URL。
 *
 * fetch 支持字符串、URL 和 Request，多形态输入需要统一为字符串才能进入 NetworkRecord。
 */
function getFetchUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url
  }

  return String(input)
}

/**
 * 获取 fetch 请求方法。
 *
 * init.method 优先级最高，其次复用 Request.method，最后回退到 GET。
 */
function getFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return init.method.toUpperCase()
  }

  if (input instanceof Request) {
    return input.method.toUpperCase()
  }

  return 'GET'
}

/**
 * 将 HeadersInit 转成普通对象。
 *
 * MCP 输出需要 JSON 友好的结构，不能直接返回 Headers 实例。
 */
function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {}
  }

  return Object.fromEntries(new Headers(headers).entries())
}

/**
 * 读取 fetch 响应体。
 *
 * 使用 clone 防止消费业务响应；读取失败时返回 undefined，让 Hook 不影响页面逻辑。
 */
async function readResponseBody(
  response: Response,
  maxBodySize: number
): Promise<string | undefined> {
  try {
    return truncateText(await response.clone().text(), maxBodySize).text
  } catch {
    return undefined
  }
}

/**
 * 解析 XHR 原始响应头。
 *
 * XHR 只提供字符串格式的响应头，拆成对象后 MCP 工具更容易过滤和展示。
 */
function parseRawHeaders(rawHeaders: string): Record<string, string> {
  return Object.fromEntries(
    rawHeaders
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf(':')
        return [
          line.slice(0, index).trim().toLowerCase(),
          line.slice(index + 1).trim()
        ]
      })
  )
}

/**
 * 安全读取 XHR responseText。
 *
 * 某些 responseType 下读取 responseText 会抛错，Hook 必须静默降级而不是影响业务请求。
 */
function safeReadXhrResponseText(xhr: XMLHttpRequest): string {
  try {
    return xhr.responseText
  } catch {
    return ''
  }
}
