import type {
  RuntimeStorageRequest,
  RuntimeStorageResult,
  StorageScope
} from '../types'

/**
 * Runtime 存储桥接负责访问页面同源存储。
 *
 * 该文件只封装浏览器公开 Web API；Cookie 仅覆盖 document.cookie 可见的同源非 HttpOnly 值，
 * 浏览器级 Cookie 和 HttpOnly 查询仍必须交给 CDP。
 */

/** Runtime 存储桥接运行环境，测试可注入内存实现，浏览器端注入真实 window。 */
export interface RuntimeStorageEnvironment {
  /** 当前页面 origin，用于拒绝跨源误操作。 */
  readonly origin: string
  /** 当前页面同源 localStorage。 */
  readonly localStorage: Storage
  /** 当前页面同源 sessionStorage。 */
  readonly sessionStorage: Storage
  /** 当前页面同源 IndexedDB 工厂。 */
  readonly indexedDB?: Pick<IDBFactory, 'databases' | 'open'> | MemoryIndexedDb
  /** 当前页面 document.cookie 访问器，测试可注入内存实现。 */
  readonly cookie?: RuntimeCookieAccess
}

/** Runtime 存储桥接服务，暴露给 Vite RPC 的浏览器侧实现复用。 */
export interface RuntimeStorageBridge {
  /** 根据固定动作访问同源存储，所有错误都会被收敛成结构化结果。 */
  manageStorage(request: RuntimeStorageRequest): Promise<RuntimeStorageResult>
}

/** Runtime Cookie 访问器，保留 document.cookie 的 getter/setter 语义以便测试替换。 */
export interface RuntimeCookieAccess {
  /** 读取当前页面可见 Cookie 字符串。 */
  get(): string
  /** 写入一条 document.cookie 指令。 */
  set(value: string): void
}

/** 测试用内存 IndexedDB 形态，避免单元测试依赖真实浏览器事务实现。 */
export interface MemoryIndexedDb {
  readonly stores: Map<string, Map<string, unknown>>
  databases(): Promise<Array<{ readonly name: string | null; readonly version: number }>>
}

/**
 * 创建 Runtime 存储桥接。
 *
 * 参数化环境让单元测试无需真实浏览器，也能验证同源限制和 Web Storage 读写删边界。
 */
export function createRuntimeStorageBridge(
  env: RuntimeStorageEnvironment
): RuntimeStorageBridge {
  return {
    async manageStorage(request) {
      try {
        return await manageRuntimeStorage(env, request)
      } catch (error) {
        return createRuntimeStorageError(
          request,
          error instanceof Error ? error.message : String(error)
        )
      }
    }
  }
}

async function manageRuntimeStorage(
  env: RuntimeStorageEnvironment,
  request: RuntimeStorageRequest
): Promise<RuntimeStorageResult> {
  if (request.origin !== env.origin) {
    return createRuntimeStorageError(
      request,
      'Runtime storage access is limited to the current page origin'
    )
  }

  if (request.scope === 'cookie') {
    return manageRuntimeCookie(env, request)
  }

  if (request.scope === 'indexedDB') {
    return manageRuntimeIndexedDb(env, request)
  }

  return manageRuntimeWebStorage(getWebStorage(env, request.scope), request)
}

function manageRuntimeCookie(
  env: RuntimeStorageEnvironment,
  request: RuntimeStorageRequest
): RuntimeStorageResult {
  if (!env.cookie) {
    return createRuntimeStorageError(
      request,
      'Runtime cookie access is unavailable',
      ['document.cookie is not available in this runtime environment']
    )
  }

  if (request.action === 'list') {
    return createRuntimeStorageSuccess(request, {
      origin: request.origin,
      cookies: readRuntimeCookies(env.cookie)
    })
  }

  if (request.action === 'get') {
    assertCookieName(request)

    return createRuntimeStorageSuccess(request, {
      origin: request.origin,
      cookies: readRuntimeCookies(env.cookie).filter(
        (cookie) => cookie.name === request.cookie.name
      )
    })
  }

  if (request.action === 'set') {
    assertCookieName(request)
    env.cookie.set(createRuntimeCookieWrite(request))

    return createRuntimeStorageSuccess(request, { ok: true })
  }

  if (request.action === 'delete') {
    assertCookieName(request)
    env.cookie.set(createRuntimeCookieDelete(request))

    return createRuntimeStorageSuccess(request, {
      deletedCount: 1,
      skippedHttpOnlyCount: 0,
      limitations: ['HttpOnly cookies are invisible to runtime cookie access']
    })
  }

  const cookies = readRuntimeCookies(env.cookie)

  for (const cookie of cookies) {
    env.cookie.set(
      createRuntimeCookieDelete({
        ...request,
        cookie: {
          name: cookie.name,
          path: request.cookie?.path
        }
      })
    )
  }

  return createRuntimeStorageSuccess(request, {
    deletedCount: cookies.length,
    skippedHttpOnlyCount: 0,
    limitations: ['HttpOnly cookies are invisible to runtime cookie access']
  })
}

function getWebStorage(
  env: RuntimeStorageEnvironment,
  scope: StorageScope
): Storage {
  return scope === 'sessionStorage' ? env.sessionStorage : env.localStorage
}

function manageRuntimeWebStorage(
  storage: Storage,
  request: RuntimeStorageRequest
): RuntimeStorageResult {
  if (request.action === 'list') {
    return createRuntimeStorageSuccess(request, {
      origin: request.origin,
      scope: request.scope,
      entries: readStorageEntries(storage)
    })
  }

  if (request.action === 'get') {
    assertStorageKey(request)

    return createRuntimeStorageSuccess(request, {
      origin: request.origin,
      scope: request.scope,
      key: request.key,
      value: storage.getItem(request.key)
    })
  }

  if (request.action === 'set') {
    assertStorageKey(request)
    storage.setItem(request.key, request.value ?? '')

    return createRuntimeStorageSuccess(request, { ok: true })
  }

  if (request.action === 'delete') {
    assertStorageKey(request)
    storage.removeItem(request.key)

    return createRuntimeStorageSuccess(request, { ok: true })
  }

  storage.clear()

  return createRuntimeStorageSuccess(request, { ok: true })
}

async function manageRuntimeIndexedDb(
  env: RuntimeStorageEnvironment,
  request: RuntimeStorageRequest
): Promise<RuntimeStorageResult> {
  if (!env.indexedDB?.databases) {
    return createRuntimeStorageError(request, 'IndexedDB metadata API is unavailable')
  }

  if (request.action === 'list') {
    const databases = await env.indexedDB.databases()

    return createRuntimeStorageSuccess(request, {
      origin: request.origin,
      scope: request.scope,
      databases: databases.map((database) => ({
        name: database.name,
        version: database.version
      }))
    })
  }

  assertIndexedDbTarget(request)

  if ('stores' in env.indexedDB) {
    return manageMemoryIndexedDb(env.indexedDB, request)
  }

  return manageBrowserIndexedDb(env.indexedDB, request)
}

function manageMemoryIndexedDb(
  indexedDB: MemoryIndexedDb,
  request: RuntimeStorageRequest & {
    readonly databaseName: string
    readonly objectStoreName: string
  }
): RuntimeStorageResult {
  const storeId = `${request.databaseName}:${request.objectStoreName}`
  const store = indexedDB.stores.get(storeId) ?? new Map<string, unknown>()
  indexedDB.stores.set(storeId, store)

  if (request.action === 'get') {
    assertStorageKey(request)

    return createRuntimeStorageSuccess(request, {
      key: request.key,
      value: store.get(request.key) ?? null
    })
  }

  if (request.action === 'set') {
    assertStorageKey(request)
    store.set(request.key, parseIndexedDbValue(request.value))

    return createRuntimeStorageSuccess(request, { ok: true })
  }

  if (request.action === 'delete') {
    assertStorageKey(request)
    store.delete(request.key)

    return createRuntimeStorageSuccess(request, { ok: true })
  }

  store.clear()

  return createRuntimeStorageSuccess(request, { ok: true })
}

async function manageBrowserIndexedDb(
  indexedDB: Pick<IDBFactory, 'open'>,
  request: RuntimeStorageRequest & {
    readonly databaseName: string
    readonly objectStoreName: string
  }
): Promise<RuntimeStorageResult> {
  const database = await openIndexedDbForRequest(indexedDB, request)

  try {
    return await executeIndexedDbTransaction(database, request)
  } finally {
    database.close()
  }
}

function openIndexedDb(
  indexedDB: Pick<IDBFactory, 'open'>,
  databaseName: string
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName)
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB open failed'))
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
  })
}

/**
 * 按操作意图打开 IndexedDB。
 *
 * 浏览器原生 IndexedDB 只能在版本升级阶段创建 object store；set 操作代表明确写入意图，
 * 因此允许自动升版本建 store，避免 MCP 使用方必须先写一段页面脚本初始化数据库。
 */
async function openIndexedDbForRequest(
  indexedDB: Pick<IDBFactory, 'open'>,
  request: RuntimeStorageRequest & {
    readonly databaseName: string
    readonly objectStoreName: string
  }
): Promise<IDBDatabase> {
  const database = await openIndexedDb(indexedDB, request.databaseName)

  if (
    request.action !== 'set' ||
    database.objectStoreNames.contains(request.objectStoreName)
  ) {
    return database
  }

  const version = database.version + 1
  database.close()

  return openIndexedDbWithStore(indexedDB, {
    databaseName: request.databaseName,
    objectStoreName: request.objectStoreName,
    version
  })
}

/**
 * 升级 IndexedDB 并创建缺失的 object store。
 *
 * 该函数只服务 set 的自动初始化场景；读、删、清仍要求目标 store 已存在，以便暴露错误而不是
 * 静默创建空库造成误判。
 */
function openIndexedDbWithStore(
  indexedDB: Pick<IDBFactory, 'open'>,
  options: {
    readonly databaseName: string
    readonly objectStoreName: string
    readonly version: number
  }
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(options.databaseName, options.version)
    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(options.objectStoreName)) {
        database.createObjectStore(options.objectStoreName)
      }
    }
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB upgrade failed'))
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
  })
}

function executeIndexedDbTransaction(
  database: IDBDatabase,
  request: RuntimeStorageRequest & {
    readonly databaseName: string
    readonly objectStoreName: string
  }
): Promise<RuntimeStorageResult> {
  return new Promise((resolve, reject) => {
    const mode = request.action === 'get' ? 'readonly' : 'readwrite'
    const transaction = database.transaction(request.objectStoreName, mode)
    const store = transaction.objectStore(request.objectStoreName)

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    }

    if (request.action === 'get') {
      assertStorageKey(request)
      const getRequest = store.get(request.key)
      getRequest.onerror = () => {
        reject(getRequest.error ?? new Error('IndexedDB get failed'))
      }
      getRequest.onsuccess = () => {
        const value: unknown = getRequest.result ?? null
        resolve(
          createRuntimeStorageSuccess(request, {
            key: request.key,
            value
          })
        )
      }
      return
    }

    if (request.action === 'set') {
      assertStorageKey(request)
      store.put(parseIndexedDbValue(request.value), request.key)
      transaction.oncomplete = () => {
        resolve(createRuntimeStorageSuccess(request, { ok: true }))
      }
      return
    }

    if (request.action === 'delete') {
      assertStorageKey(request)
      store.delete(request.key)
      transaction.oncomplete = () => {
        resolve(createRuntimeStorageSuccess(request, { ok: true }))
      }
      return
    }

    store.clear()
    transaction.oncomplete = () => {
      resolve(createRuntimeStorageSuccess(request, { ok: true }))
    }
  })
}

function readStorageEntries(storage: Storage): Array<{
  readonly key: string
  readonly value: string
}> {
  const entries: Array<{ key: string; value: string }> = []

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)

    if (!key) {
      continue
    }

    const value = storage.getItem(key)

    if (value === null) {
      continue
    }

    entries.push({ key, value })
  }

  return entries
}

function readRuntimeCookies(cookieAccess: RuntimeCookieAccess): Array<{
  readonly name: string
  readonly value: string
}> {
  return cookieAccess
    .get()
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separatorIndex = item.indexOf('=')

      if (separatorIndex === -1) {
        return { name: decodeCookiePart(item), value: '' }
      }

      return {
        name: decodeCookiePart(item.slice(0, separatorIndex)),
        value: decodeCookiePart(item.slice(separatorIndex + 1))
      }
    })
}

function createRuntimeCookieWrite(request: RuntimeStorageRequest & {
  readonly cookie: NonNullable<RuntimeStorageRequest['cookie']>
}): string {
  const value = request.cookie.value ?? request.value ?? ''
  const parts = [
    `${encodeURIComponent(request.cookie.name)}=${encodeURIComponent(value)}`
  ]

  appendRuntimeCookieAttributes(parts, request.cookie)

  return parts.join('; ')
}

function createRuntimeCookieDelete(request: RuntimeStorageRequest & {
  readonly cookie: NonNullable<RuntimeStorageRequest['cookie']>
}): string {
  const parts = [
    `${encodeURIComponent(request.cookie.name)}=`,
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0'
  ]

  appendRuntimeCookieAttributes(parts, {
    path: request.cookie.path,
    domain: request.cookie.domain
  })

  return parts.join('; ')
}

function appendRuntimeCookieAttributes(
  parts: string[],
  cookie: Partial<NonNullable<RuntimeStorageRequest['cookie']>>
): void {
  if (cookie.path) {
    parts.push(`Path=${cookie.path}`)
  }

  if (cookie.domain) {
    parts.push(`Domain=${cookie.domain}`)
  }

  if (cookie.expires !== undefined) {
    parts.push(`Expires=${new Date(cookie.expires * 1000).toUTCString()}`)
  }

  if (cookie.sameSite) {
    parts.push(`SameSite=${normalizeRuntimeSameSite(cookie.sameSite)}`)
  }

  if (cookie.secure) {
    parts.push('Secure')
  }
}

function normalizeRuntimeSameSite(
  sameSite: 'strict' | 'lax' | 'none'
): 'Strict' | 'Lax' | 'None' {
  if (sameSite === 'strict') {
    return 'Strict'
  }

  if (sameSite === 'lax') {
    return 'Lax'
  }

  return 'None'
}

function decodeCookiePart(value: string): string {
  try {
    return decodeURIComponent(value)
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

function assertCookieName(
  request: RuntimeStorageRequest
): asserts request is RuntimeStorageRequest & {
  readonly cookie: NonNullable<RuntimeStorageRequest['cookie']>
} {
  if (!request.cookie?.name) {
    throw new Error('Cookie name is required for this operation')
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

function parseIndexedDbValue(value?: string): unknown {
  if (value === undefined) {
    return null
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function createRuntimeStorageSuccess(
  request: RuntimeStorageRequest,
  data: unknown
): RuntimeStorageResult {
  return {
    ok: true,
    source: 'hook',
    action: request.action,
    scope: request.scope,
    data
  }
}

function createRuntimeStorageError(
  request: RuntimeStorageRequest,
  error: string,
  limitations?: string[]
): RuntimeStorageResult {
  return {
    ok: false,
    source: 'hook',
    action: request.action,
    scope: request.scope,
    error,
    limitations
  }
}
