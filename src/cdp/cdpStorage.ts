import type CDP from 'chrome-remote-interface'
import type { RuntimeStorageRequest, RuntimeStorageResult } from '../types'

/**
 * CDP 存储适配器。
 *
 * Cookie 和部分 IndexedDB 能力需要浏览器协议权限；单独收敛在这里可以避免 MCP 工具层
 * 直接拼协议参数，也让 HttpOnly 删除限制集中审查。
 */

/** CDP 存储适配器实例。 */
export interface CdpStorageAdapter {
  /** 根据统一存储请求调用 CDP 存储协议。 */
  manageStorage(request: RuntimeStorageRequest): Promise<RuntimeStorageResult>
}

/**
 * 创建 CDP 存储适配器。
 *
 * 调用方负责连接和关闭 CDP client，本适配器只执行单次存储操作。
 */
export function createCdpStorageAdapter(client: CDP.Client): CdpStorageAdapter {
  return {
    async manageStorage(request) {
      try {
        return await manageCdpStorage(client, request)
      } catch (error) {
        return createCdpStorageError(
          request,
          error instanceof Error ? error.message : String(error)
        )
      }
    }
  }
}

async function manageCdpStorage(
  client: CDP.Client,
  request: RuntimeStorageRequest
): Promise<RuntimeStorageResult> {
  if (request.scope === 'cookie') {
    return manageCdpCookies(client, request)
  }

  if (request.scope === 'indexedDB') {
    return manageCdpIndexedDb(client, request)
  }

  return manageCdpDomStorage(client, request)
}

async function manageCdpCookies(
  client: CDP.Client,
  request: RuntimeStorageRequest
): Promise<RuntimeStorageResult> {
  if (request.action === 'list' || request.action === 'get') {
    const result = await client.Storage.getCookies()
    const cookies = result.cookies.filter((cookie) =>
      isCookieInOrigin(cookie, request.origin)
    )

    return createCdpStorageSuccess(request, {
      origin: request.origin,
      cookies:
        request.action === 'get' && request.cookie?.name
          ? cookies.filter((cookie) => cookie.name === request.cookie?.name)
          : cookies
    })
  }

  if (request.action === 'set') {
    if (!request.cookie?.name) {
      throw new Error('Cookie name is required for set operation')
    }

    await client.Storage.setCookies({
      cookies: [
        {
          name: request.cookie.name,
          value: request.cookie.value ?? request.value ?? '',
          url: request.cookie.url ?? request.origin,
          domain: request.cookie.domain,
          path: request.cookie.path,
          httpOnly: request.cookie.httpOnly,
          secure: request.cookie.secure,
          sameSite: normalizeCookieSameSite(request.cookie.sameSite),
          expires: request.cookie.expires
        }
      ]
    })

    return createCdpStorageSuccess(request, { ok: true })
  }

  const result = await client.Storage.getCookies()
  const cookies = result.cookies.filter((cookie) =>
    isCookieInOrigin(cookie, request.origin)
  )
  const candidates =
    request.action === 'delete' && request.cookie?.name
      ? cookies.filter((cookie) => cookie.name === request.cookie?.name)
      : cookies
  const deletable = candidates.filter((cookie) => !cookie.httpOnly)
  const skippedHttpOnlyCount = candidates.length - deletable.length

  for (const cookie of deletable) {
    await client.Network.deleteCookies({
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path
    })
  }

  return createCdpStorageSuccess(request, {
    deletedCount: deletable.length,
    skippedHttpOnlyCount
  })
}

async function manageCdpDomStorage(
  client: CDP.Client,
  request: RuntimeStorageRequest
): Promise<RuntimeStorageResult> {
  const storageId = {
    securityOrigin: request.origin,
    isLocalStorage: request.scope === 'localStorage'
  }

  if (request.action === 'list') {
    const result = await client.DOMStorage.getDOMStorageItems({ storageId })

    return createCdpStorageSuccess(request, {
      origin: request.origin,
      scope: request.scope,
      entries: result.entries.map(([key, value]) => ({ key, value }))
    })
  }

  if (request.action === 'get') {
    assertStorageKey(request)
    const result = await client.DOMStorage.getDOMStorageItems({ storageId })
    const entry = result.entries.find(([key]) => key === request.key)

    return createCdpStorageSuccess(request, {
      key: request.key,
      value: entry?.[1] ?? null
    })
  }

  if (request.action === 'set') {
    assertStorageKey(request)
    await client.DOMStorage.setDOMStorageItem({
      storageId,
      key: request.key,
      value: request.value ?? ''
    })

    return createCdpStorageSuccess(request, { ok: true })
  }

  if (request.action === 'delete') {
    assertStorageKey(request)
    await client.DOMStorage.removeDOMStorageItem({
      storageId,
      key: request.key
    })

    return createCdpStorageSuccess(request, { ok: true })
  }

  const result = await client.DOMStorage.getDOMStorageItems({ storageId })

  for (const [key] of result.entries) {
    await client.DOMStorage.removeDOMStorageItem({ storageId, key })
  }

  return createCdpStorageSuccess(request, { deletedCount: result.entries.length })
}

async function manageCdpIndexedDb(
  client: CDP.Client,
  request: RuntimeStorageRequest
): Promise<RuntimeStorageResult> {
  if (request.action === 'list') {
    const result = await client.IndexedDB.requestDatabaseNames({
      securityOrigin: request.origin
    })

    return createCdpStorageSuccess(request, {
      origin: request.origin,
      databases: result.databaseNames
    })
  }

  assertIndexedDbTarget(request)

  if (request.action === 'get') {
    const result = await client.IndexedDB.requestData({
      securityOrigin: request.origin,
      databaseName: request.databaseName,
      objectStoreName: request.objectStoreName,
      indexName: request.indexName ?? '',
      skipCount: 0,
      pageSize: 100
    })

    return createCdpStorageSuccess(request, {
      entries: result.objectStoreDataEntries,
      hasMore: result.hasMore
    })
  }

  if (request.action === 'delete') {
    assertStorageKey(request)
    await client.IndexedDB.deleteObjectStoreEntries({
      securityOrigin: request.origin,
      databaseName: request.databaseName,
      objectStoreName: request.objectStoreName,
      keyRange: createExactCdpKeyRange(request.key) as never
    })

    return createCdpStorageSuccess(request, { ok: true })
  }

  if (request.action === 'clear') {
    if (request.objectStoreName) {
      await client.IndexedDB.clearObjectStore({
        securityOrigin: request.origin,
        databaseName: request.databaseName,
        objectStoreName: request.objectStoreName
      })

      return createCdpStorageSuccess(request, { ok: true })
    }

    await client.IndexedDB.deleteDatabase({
      securityOrigin: request.origin,
      databaseName: request.databaseName
    })

    return createCdpStorageSuccess(request, { ok: true })
  }

  return createCdpStorageError(
    request,
    'IndexedDB set operation requires runtime bridge'
  )
}

function isCookieInOrigin(
  cookie: { readonly domain?: string },
  origin: string
): boolean {
  const hostname = new URL(origin).hostname
  const domain = cookie.domain?.replace(/^\./, '')

  return Boolean(domain && (hostname === domain || hostname.endsWith(`.${domain}`)))
}

function normalizeCookieSameSite(
  sameSite?: 'strict' | 'lax' | 'none'
): 'Strict' | 'Lax' | 'None' | undefined {
  if (!sameSite) {
    return undefined
  }

  if (sameSite === 'strict') {
    return 'Strict'
  }

  if (sameSite === 'lax') {
    return 'Lax'
  }

  return 'None'
}

function createExactCdpKeyRange(key: string): {
  readonly lower: unknown
  readonly upper: unknown
  readonly lowerOpen: boolean
  readonly upperOpen: boolean
} {
  const parsedKey = parseJsonValue(key)

  return {
    lower: parsedKey,
    upper: parsedKey,
    lowerOpen: false,
    upperOpen: false
  }
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function assertStorageKey(
  request: RuntimeStorageRequest
): asserts request is RuntimeStorageRequest & { readonly key: string } {
  if (!request.key) {
    throw new Error('Storage key is required for this operation')
  }
}

function assertIndexedDbTarget(
  request: RuntimeStorageRequest
): asserts request is RuntimeStorageRequest & {
  readonly databaseName: string
  readonly objectStoreName: string
} {
  if (!request.databaseName || !request.objectStoreName) {
    throw new Error('IndexedDB databaseName and objectStoreName are required')
  }
}

function createCdpStorageSuccess(
  request: RuntimeStorageRequest,
  data: unknown
): RuntimeStorageResult {
  return {
    ok: true,
    source: 'cdp',
    action: request.action,
    scope: request.scope,
    data
  }
}

function createCdpStorageError(
  request: RuntimeStorageRequest,
  error: string
): RuntimeStorageResult {
  return {
    ok: false,
    source: 'cdp',
    action: request.action,
    scope: request.scope,
    error
  }
}
