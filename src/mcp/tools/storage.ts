import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createCdpStorageAdapter } from '../../cdp/cdpStorage'
import { MCP_TOOL_NAMES } from '../../constants'
import type {
  RuntimeStorageRequest,
  StorageAction,
  StorageScope,
  VueMcpNextContext
} from '../../types'
import {
  closeCdpClient,
  connectCdpForPage,
  createToolError,
  createToolResponse,
  requestRuntimeData,
  resolvePageTarget
} from '../routeTools'

/**
 * 注册浏览器存储相关 MCP 工具。
 *
 * 存储能力同时触及页面同源数据和浏览器级 Cookie，必须单独成组以便清晰表达 runtime 同源边界、
 * CDP 浏览器级能力，以及 HttpOnly Cookie 的只读/不可见限制。
 */
export function registerStorageTools(
  server: McpServer,
  ctx: VueMcpNextContext
): void {
  registerStorageTool(server, MCP_TOOL_NAMES.listStorage, {
    description: 'List same-origin storage and CDP cookies when available.',
    inputSchema: {
      pageId: z.string().optional()
    },
    action: 'list',
    handler: (input) => handleListStorage(ctx, input.pageId)
  })
  registerStorageTool(server, MCP_TOOL_NAMES.getStorageItem, {
    description: 'Read one storage entry.',
    inputSchema: createStorageInputSchema(),
    action: 'get',
    handler: (input) => handleStorageAction(ctx, { ...input, action: 'get' })
  })
  registerStorageTool(server, MCP_TOOL_NAMES.setStorageItem, {
    description: 'Write one storage entry.',
    inputSchema: createStorageInputSchema(),
    action: 'set',
    handler: (input) => handleStorageAction(ctx, { ...input, action: 'set' })
  })
  registerStorageTool(server, MCP_TOOL_NAMES.deleteStorageItem, {
    description: 'Delete one storage entry.',
    inputSchema: createStorageInputSchema(),
    action: 'delete',
    handler: (input) => handleStorageAction(ctx, { ...input, action: 'delete' })
  })
  registerStorageTool(server, MCP_TOOL_NAMES.clearStorage, {
    description: 'Clear one storage scope.',
    inputSchema: createStorageInputSchema(),
    action: 'clear',
    handler: (input) => handleStorageAction(ctx, { ...input, action: 'clear' })
  })
}

interface StorageToolInput {
  readonly pageId?: string
  readonly action: StorageAction
  readonly scope?: StorageScope
  readonly key?: string
  readonly value?: string
  readonly databaseName?: string
  readonly objectStoreName?: string
  readonly indexName?: string
  readonly cookie?: RuntimeStorageRequest['cookie']
}

function registerStorageTool<TInput extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  options: {
    readonly description: string
    readonly inputSchema: TInput
    readonly action: StorageAction
    readonly handler: (input: z.infer<z.ZodObject<TInput>>) => Promise<unknown>
  }
): void {
  server.registerTool(
    name,
    {
      description: options.description,
      inputSchema: options.inputSchema
    },
    (async (input: unknown) =>
      options.handler(
        input as z.infer<z.ZodObject<TInput>>
      )) as never
  )
}

function createStorageInputSchema() {
  return {
    pageId: z.string().optional(),
    scope: z
      .enum(['localStorage', 'sessionStorage', 'indexedDB', 'cookie'])
      .optional(),
    key: z.string().optional(),
    value: z.string().optional(),
    databaseName: z.string().optional(),
    objectStoreName: z.string().optional(),
    indexName: z.string().optional(),
    cookie: z
      .object({
        name: z.string(),
        value: z.string().optional(),
        domain: z.string().optional(),
        path: z.string().optional(),
        url: z.string().optional(),
        httpOnly: z.boolean().optional(),
        secure: z.boolean().optional(),
        sameSite: z.enum(['strict', 'lax', 'none']).optional(),
        expires: z.number().optional()
      })
      .optional()
  }
}

/**
 * 汇总当前页面可访问的同源存储，并附加 Cookie 概览。
 *
 * list_storage 面向排查场景，默认返回整体概览比单 scope 更符合使用预期；Cookie 在 CDP 可用时
 * 使用浏览器级查询，否则回退到 document.cookie 可见的同源 Cookie。
 */
async function handleListStorage(
  ctx: VueMcpNextContext,
  pageId?: string
) {
  let baseRequest: RuntimeStorageRequest

  try {
    baseRequest = createStorageRequest(ctx, {
      pageId,
      action: 'list',
      scope: 'localStorage'
    })
  } catch (error) {
    return createToolError(error instanceof Error ? error.message : String(error))
  }

  const [localStorage, sessionStorage, indexedDB] = await Promise.all([
    requestRuntimeStorage(ctx, { ...baseRequest, scope: 'localStorage' }),
    requestRuntimeStorage(ctx, { ...baseRequest, scope: 'sessionStorage' }),
    requestRuntimeStorage(ctx, { ...baseRequest, scope: 'indexedDB' })
  ])
  const cookie = await listCookiesIfCdpAvailable(ctx, baseRequest, pageId)

  return createToolResponse({
    ok: true,
    origin: baseRequest.origin,
    localStorage: extractStorageData(localStorage),
    sessionStorage: extractStorageData(sessionStorage),
    indexedDB: extractStorageData(indexedDB),
    cookie
  })
}

/**
 * 执行单个存储读写动作，并按 scope 选择 CDP 或运行时桥接。
 *
 * Cookie 属于浏览器级资源，必须走 CDP；IndexedDB 写入仍保留运行时桥接作为兜底，因为 CDP
 * 不提供通用的对象写入接口。
 */
async function handleStorageAction(
  ctx: VueMcpNextContext,
  input: StorageToolInput
) {
  let request: RuntimeStorageRequest

  try {
    request = createStorageRequest(ctx, input)
  } catch (error) {
    return createToolError(error instanceof Error ? error.message : String(error))
  }

  const cdp = await connectCdpForPage(ctx, input.pageId)

  if (cdp && shouldUseCdpStorage(request)) {
    try {
      const result = await createCdpStorageAdapter(cdp.client).manageStorage(
        request
      )

      return createToolResponse(result)
    } finally {
      await closeCdpClient(cdp.client)
    }
  }

  const result = await requestRuntimeStorage(ctx, request)

  return createToolResponse(result)
}

/**
 * 通过页面运行时桥接访问同源存储。
 *
 * 该路径继承浏览器同源策略，适合 localStorage、sessionStorage 以及 IndexedDB 的页面级操作。
 */
async function requestRuntimeStorage(
  ctx: VueMcpNextContext,
  request: RuntimeStorageRequest
): Promise<unknown> {
  return requestRuntimeData(ctx, (event) => {
    void ctx.rpcServer?.manageStorage({
      ...request,
      event
    })
  })
}

/**
 * 读取 Cookie 概览。
 *
 * CDP 可用时返回浏览器级 Cookie；否则回退到 runtime 可见 Cookie，避免无 CDP 环境下丢失
 * 当前页面同源 Cookie 的基础排查能力。
 */
async function listCookiesIfCdpAvailable(
  ctx: VueMcpNextContext,
  request: RuntimeStorageRequest,
  pageId?: string
): Promise<unknown> {
  if (!hasCdpConfig(ctx)) {
    return extractStorageData(
      await requestRuntimeStorage(ctx, { ...request, scope: 'cookie' })
    )
  }

  const cdp = await connectCdpForPage(ctx, pageId)

  if (!cdp) {
    return extractStorageData(
      await requestRuntimeStorage(ctx, { ...request, scope: 'cookie' })
    )
  }

  try {
    const result = await createCdpStorageAdapter(cdp.client).manageStorage({
      ...request,
      scope: 'cookie'
    })

    return extractStorageData(result)
  } finally {
    await closeCdpClient(cdp.client)
  }
}

/**
 * 提取存储适配器的业务数据。
 *
 * MCP 工具对外只需要展示实际存储内容；保留原始结果作为异常形态兜底，便于测试和调试定位。
 */
function extractStorageData(result: unknown): unknown {
  if (!isStorageResultRecord(result)) {
    return result
  }

  return result.data ?? result
}

/**
 * 判断结果是否符合存储适配器的基础结构。
 *
 * 这里仅检查 ok 字段，避免对不同 scope 的 data 形态做过度约束。
 */
function isStorageResultRecord(
  value: unknown
): value is { readonly data?: unknown } {
  return typeof value === 'object' && value !== null && 'ok' in value
}

/**
 * 判断单次存储操作是否应交给 CDP。
 *
 * Cookie 需要浏览器级权限，始终走 CDP；IndexedDB 属于页面同源存储，统一走 runtime 桥接，
 * 避免不同浏览器版本的 CDP IndexedDB 协议差异导致读取或删除卡住。
 */
function shouldUseCdpStorage(request: RuntimeStorageRequest): boolean {
  return request.scope === 'cookie'
}

function createStorageRequest(
  ctx: VueMcpNextContext,
  input: StorageToolInput
): RuntimeStorageRequest {
  const page = resolvePageTarget(ctx, input.pageId)
  const origin = new URL(page.url).origin

  return {
    event: '',
    pageId: page.pageId,
    origin,
    action: input.action,
    scope: normalizeScope(input.scope),
    key: input.key,
    value: input.value,
    databaseName: input.databaseName,
    objectStoreName: input.objectStoreName,
    indexName: input.indexName,
    cookie: input.cookie
  }
}

function normalizeScope(scope?: StorageScope): StorageScope {
  return scope ?? 'localStorage'
}

function hasCdpConfig(ctx: VueMcpNextContext): boolean {
  return Boolean(ctx.options.cdp.browserUrl || ctx.options.cdp.wsEndpoint)
}
