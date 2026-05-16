import type CDP from 'chrome-remote-interface'
import { nanoid } from 'nanoid'
import { maskHeaders } from '../shared/sanitize'
import { parseRequestQuery } from '../shared/url'
import type { NetworkRecord } from '../types'

/**
 * CDP Network 监听参数。
 *
 * CDP 能看到比 fetch/XHR Hook 更完整的请求生命周期，因此配置可用时优先使用该通道。
 */
export interface CdpNetworkOptions {
  /** 已连接的 CDP client。 */
  readonly client: CDP.Client
  /** 页面 ID，用于和 runtime target 合并展示。 */
  readonly pageId: string
  /** 需要脱敏的 header 名称。 */
  readonly maskHeaders: readonly string[]
  /** 是否采集响应体，响应体读取可能失败，不能影响请求记录。 */
  readonly captureResponseBody: boolean
  /** 写入网络缓存的回调。 */
  readonly push: (record: NetworkRecord) => void
}

/**
 * 启动 CDP Network 监听。
 *
 * 记录按 requestId 暂存，等 loadingFinished 或 loadingFailed 后再推送最终记录，
 * 这样可以把请求、响应和错误信息合并成一个 NetworkRecord。
 */
export async function startCdpNetwork(
  options: CdpNetworkOptions
): Promise<void> {
  const records = new Map<string, NetworkRecord>()

  await options.client.Network.enable()
  options.client.Network.requestWillBeSent((event) => {
    records.set(event.requestId, {
      id: nanoid(),
      pageId: options.pageId,
      source: 'cdp',
      url: event.request.url,
      method: event.request.method,
      requestHeaders: maskHeaders(
        normalizeHeaders(event.request.headers),
        options.maskHeaders
      ),
      requestQuery: parseRequestQuery(event.request.url),
      requestBody: event.request.postData,
      startedAt: event.timestamp * 1000
    })
  })
  options.client.Network.responseReceived((event) => {
    const record = records.get(event.requestId)

    if (!record) {
      return
    }

    records.set(event.requestId, {
      ...record,
      status: event.response.status,
      responseHeaders: normalizeHeaders(event.response.headers)
    })
  })
  options.client.Network.loadingFinished((event) => {
    void finalizeCdpNetworkRecord(
      options,
      records,
      event.requestId,
      event.timestamp * 1000
    )
  })
  options.client.Network.loadingFailed((event) => {
    const record = records.get(event.requestId)

    if (!record) {
      return
    }

    records.delete(event.requestId)
    options.push({
      ...record,
      error: event.errorText,
      endedAt: event.timestamp * 1000,
      durationMs: event.timestamp * 1000 - record.startedAt
    })
  })
}

/**
 * 完成 CDP 网络记录。
 *
 * response body 可能因为跨域、缓存或 DevTools 限制读取失败，失败时只省略 body，不中断记录推送。
 */
async function finalizeCdpNetworkRecord(
  options: CdpNetworkOptions,
  records: Map<string, NetworkRecord>,
  requestId: string,
  endedAt: number
): Promise<void> {
  const record = records.get(requestId)

  if (!record) {
    return
  }

  records.delete(requestId)
  options.push({
    ...record,
    responseBody: options.captureResponseBody
      ? await safeGetResponseBody(options.client, requestId)
      : undefined,
    endedAt,
    durationMs: endedAt - record.startedAt
  })
}

/**
 * 安全读取 CDP 响应体。
 *
 * CDP 的 getResponseBody 在部分请求上会失败，调试工具不能因为单个 body 失败丢掉整条请求。
 */
async function safeGetResponseBody(
  client: CDP.Client,
  requestId: string
): Promise<string | undefined> {
  try {
    return (await client.Network.getResponseBody({ requestId })).body
  } catch {
    return undefined
  }
}

/**
 * 归一化 CDP headers。
 *
 * CDP header value 可能不是字符串，统一转字符串可以保持 NetworkRecord 可序列化。
 */
function normalizeHeaders(
  headers: Record<string, unknown>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)])
  )
}
