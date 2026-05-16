import {
  DEFAULT_CONSOLE_MAX_RECORDS,
  DEFAULT_DOM_MAX_DEPTH,
  DEFAULT_DOM_MAX_NODES,
  DEFAULT_DOM_MAX_TEXT_LENGTH,
  DEFAULT_MASK_HEADERS,
  DEFAULT_NETWORK_MAX_BODY_SIZE,
  DEFAULT_NETWORK_MAX_RECORDS
} from './shared/limits'
import type { ResolvedVueMcpNextOptions, VueMcpNextOptions } from './types'

/** 默认 MCP 挂载路径，使用双下划线前缀避免与业务路由冲突。 */
export const DEFAULT_MCP_PATH = '/__mcp'

/** MCP 工具名集中管理，避免工具注册和测试中出现拼写漂移。 */
export const MCP_TOOL_NAMES = {
  listPages: 'list_pages',
  getPageState: 'get_page_state',
  getDomTree: 'get_dom_tree',
  queryDom: 'query_dom',
  getConsoleLogs: 'get_console_logs',
  clearConsoleLogs: 'clear_console_logs',
  evaluateScript: 'evaluate_script',
  getNetworkRequests: 'get_network_requests',
  getNetworkRequestDetail: 'get_network_request_detail',
  clearNetworkRequests: 'clear_network_requests',
  getComponentTree: 'get_component_tree',
  getComponentState: 'get_component_state',
  editComponentState: 'edit_component_state',
  highlightComponent: 'highlight_component',
  getRouterInfo: 'get_router_info',
  getPiniaTree: 'get_pinia_tree',
  getPiniaState: 'get_pinia_state'
} as const

/** 虚拟模块 ID 集中管理，便于注入逻辑和测试复用。 */
export const VIRTUAL_RUNTIME_ID = 'virtual:vite-plugin-vue-mcp-next/runtime'

/** Vite 内部解析虚拟模块时需要使用的空字节前缀。 */
export const RESOLVED_VIRTUAL_RUNTIME_ID = `\0${VIRTUAL_RUNTIME_ID}`

/** 安全默认值，优先保证调试工具不会默认暴露危险能力。 */
export const DEFAULT_OPTIONS: ResolvedVueMcpNextOptions = {
  mcpPath: DEFAULT_MCP_PATH,
  host: 'localhost',
  printUrl: true,
  updateCursorMcpJson: { enabled: true, serverName: 'vue-mcp-next' },
  runtime: {
    mode: 'auto',
    evaluate: {
      enabled: false,
      timeoutMs: 3000
    }
  },
  cdp: {},
  network: {
    mode: 'auto',
    maxRecords: DEFAULT_NETWORK_MAX_RECORDS,
    captureRequestBody: true,
    captureResponseBody: true,
    maxBodySize: DEFAULT_NETWORK_MAX_BODY_SIZE,
    maskHeaders: [...DEFAULT_MASK_HEADERS]
  },
  dom: {
    maxDepth: DEFAULT_DOM_MAX_DEPTH,
    maxNodes: DEFAULT_DOM_MAX_NODES,
    maxTextLength: DEFAULT_DOM_MAX_TEXT_LENGTH
  },
  console: {
    maxRecords: DEFAULT_CONSOLE_MAX_RECORDS
  }
}

/**
 * 合并用户配置和安全默认值。
 *
 * 嵌套配置不能使用浅合并，否则用户只配置一个字段时会丢掉默认安全边界。
 */
export function mergeOptions(
  options: VueMcpNextOptions = {}
): ResolvedVueMcpNextOptions {
  const cursorConfig =
    typeof options.updateCursorMcpJson === 'boolean'
      ? {
          enabled: options.updateCursorMcpJson,
          serverName: DEFAULT_OPTIONS.updateCursorMcpJson.serverName
        }
      : {
          ...DEFAULT_OPTIONS.updateCursorMcpJson,
          ...options.updateCursorMcpJson
        }

  return {
    ...DEFAULT_OPTIONS,
    ...options,
    updateCursorMcpJson: cursorConfig,
    runtime: {
      ...DEFAULT_OPTIONS.runtime,
      ...options.runtime,
      evaluate: {
        ...DEFAULT_OPTIONS.runtime.evaluate,
        ...options.runtime?.evaluate
      }
    },
    cdp: {
      ...DEFAULT_OPTIONS.cdp,
      ...options.cdp
    },
    network: {
      ...DEFAULT_OPTIONS.network,
      ...options.network,
      maskHeaders: options.network?.maskHeaders ?? [
        ...DEFAULT_OPTIONS.network.maskHeaders
      ]
    },
    dom: {
      ...DEFAULT_OPTIONS.dom,
      ...options.dom
    },
    console: {
      ...DEFAULT_OPTIONS.console,
      ...options.console
    }
  }
}
