import type { Plugin, ResolvedConfig } from 'vite'
import { searchForWorkspaceRoot } from 'vite'
import { mergeOptions, RUNTIME_PAGE_RECONNECTED_EVENT } from '../constants'
import { createVueMcpNextContext } from '../context'
import { createMcpServer } from '../mcp/createMcpServer'
import { setupMcpTransport } from '../mcp/transport'
import { createServerVueRuntimeRpc } from '../mcp/vueRpc'
import type {
  ConsoleRecord,
  NetworkRecord,
  PageTarget,
  VueMcpNextOptions
} from '../types'
import { createCdpLifecycleController } from './cdpLifecycle'
import { createRuntimeInjectionController } from './injectRuntime'
import { updateMcpClientConfigs } from './mcpClientConfig'
import { createRPCServer } from 'vite-dev-rpc'

/**
 * 创建 vite-plugin-vue-mcp-next 插件。
 *
 * 这里只编排 Vite 生命周期，把 MCP、Runtime、CDP 等细节交给独立模块，
 * 避免插件入口随着能力增加而变成难以测试的大文件。
 */
export function vueMcpNext(userOptions: VueMcpNextOptions = {}): Plugin {
  const options = mergeOptions(userOptions)
  const ctx = createVueMcpNextContext(options)
  let config: ResolvedConfig | undefined
  const runtimeInjection = createRuntimeInjectionController(
    options,
    () => config
  )
  const cdpLifecycle = createCdpLifecycleController(ctx)
  ctx.cdpLifecycle = cdpLifecycle

  return {
    name: 'vite-plugin-vue-mcp-next',
    enforce: 'pre',
    apply: 'serve',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    async configureServer(server) {
      ctx.server = server
      ctx.rpcServer = createRPCServer(
        'vite-plugin-vue-mcp-next',
        server.ws,
        createServerVueRuntimeRpc(ctx),
        {
          timeout: -1
        }
      )
      setupMcpTransport(
        options.mcpPath,
        () => createMcpServer(ctx, server),
        server
      )
      server.ws.on(
        'vite-plugin-vue-mcp-next:page-connected',
        (payload: unknown) => {
          if (isRuntimePageTarget(payload)) {
            ctx.pages.upsert(payload)
            void ctx.hooks.callHook(RUNTIME_PAGE_RECONNECTED_EVENT, payload)
            void cdpLifecycle.connectPage(payload)
          }
        }
      )
      server.ws.on(
        'vite-plugin-vue-mcp-next:console-record',
        (payload: unknown) => {
          if (isConsoleRecord(payload)) {
            ctx.consoleRecords.push(payload)
          }
        }
      )
      server.ws.on(
        'vite-plugin-vue-mcp-next:network-record',
        (payload: unknown) => {
          if (isNetworkRecord(payload)) {
            ctx.networkRecords.push(payload)
          }
        }
      )

      const port = String(server.config.server.port || 5173)
      const mcpSseUrl = `http://${options.host}:${port}${options.mcpPath}/sse`
      const mcpStreamableHttpUrl = `http://${options.host}:${port}${options.mcpPath}/mcp`
      const root = searchForWorkspaceRoot(server.config.root)
      await updateMcpClientConfigs(
        root,
        mcpSseUrl,
        mcpStreamableHttpUrl,
        options.mcpClients
      )

      if (options.printUrl) {
        setTimeout(() => {
          console.log(`  ➜  MCP:     SSE server is running at ${mcpSseUrl}`)
          console.log(
            `  ➜  MCP:     Streamable HTTP server is running at ${mcpStreamableHttpUrl}`
          )
        }, 300)
      }

      server.httpServer?.once('close', () => {
        void cdpLifecycle.closeAll()
      })
    },
    resolveId(importee) {
      return runtimeInjection.resolveId(importee)
    },
    load(id) {
      return runtimeInjection.load(id)
    },
    transform(code, id, transformOptions) {
      return runtimeInjection.transform(code, id, transformOptions?.ssr)
    },
    transformIndexHtml(html) {
      return runtimeInjection.transformIndexHtml(html)
    }
  }
}

/**
 * 校验 runtime 页面上报载荷。
 *
 * Vite WebSocket 事件来自浏览器运行时，服务端不能直接信任 unknown payload；
 * 只校验页面注册所需字段，可以让后续扩展 readyState、viewport 等额外字段时不破坏注册流程。
 */
function isRuntimePageTarget(payload: unknown): payload is PageTarget {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const target = payload as Partial<PageTarget>

  return (
    target.source === 'runtime' &&
    typeof target.pageId === 'string' &&
    typeof target.url === 'string' &&
    typeof target.pathname === 'string' &&
    typeof target.connected === 'boolean'
  )
}

/**
 * 校验 console hook 上报记录。
 *
 * Console 日志来自浏览器页面，服务端只接收最小必需字段，避免异常 payload 污染日志缓存。
 */
function isConsoleRecord(payload: unknown): payload is ConsoleRecord {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const record = payload as Partial<ConsoleRecord>

  return (
    typeof record.id === 'string' &&
    typeof record.pageId === 'string' &&
    record.source === 'hook' &&
    isConsoleLevel(record.level) &&
    typeof record.message === 'string' &&
    typeof record.timestamp === 'number'
  )
}

/**
 * 校验 Console 日志级别。
 *
 * 显式枚举可以避免浏览器端传入任意字符串后影响 MCP 过滤逻辑。
 */
function isConsoleLevel(level: unknown): level is ConsoleRecord['level'] {
  return (
    level === 'log' ||
    level === 'info' ||
    level === 'warn' ||
    level === 'error' ||
    level === 'debug'
  )
}

/**
 * 校验 network hook 上报记录。
 *
 * Network 记录可能包含响应体和请求体，服务端先校验路由所需字段，后续再由工具层做展示裁剪。
 */
function isNetworkRecord(payload: unknown): payload is NetworkRecord {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const record = payload as Partial<NetworkRecord>

  return (
    typeof record.id === 'string' &&
    typeof record.pageId === 'string' &&
    record.source === 'hook' &&
    typeof record.url === 'string' &&
    typeof record.method === 'string' &&
    typeof record.startedAt === 'number'
  )
}
