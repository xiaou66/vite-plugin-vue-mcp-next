import {
  DEFAULT_CONSOLE_MAX_RECORDS,
  DEFAULT_DOM_MAX_DEPTH,
  DEFAULT_DOM_MAX_NODES,
  DEFAULT_DOM_MAX_TEXT_LENGTH,
  DEFAULT_MASK_HEADERS,
  DEFAULT_NETWORK_MAX_BODY_SIZE,
  DEFAULT_NETWORK_MAX_RECORDS
} from './shared/limits'
import type {
  McpClientConfigOptions,
  ResolvedVueMcpNextOptions,
  VueMcpNextOptions
} from './types'

/** 默认 MCP 挂载路径，使用双下划线前缀避免与业务路由冲突。 */
export const DEFAULT_MCP_PATH = '/__mcp'

/** 默认截图最大响应体积，避免 base64 图片挤占 MCP 客户端上下文。 */
export const DEFAULT_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024

/** 默认截图保存目录，项目级 MCP 使用项目内目录方便用户复查截图文件。 */
export const DEFAULT_SCREENSHOT_SAVE_DIR = '.vite-mcp/screenshot'

/** 默认性能诊断保存目录，原始 profile 和 heap 文件都应保存在项目内。 */
export const DEFAULT_PERFORMANCE_SAVE_DIR = '.vite-mcp/performance'

/** 默认性能报告缓冲上限，避免长时间会话无限累积历史诊断结果。 */
export const DEFAULT_PERFORMANCE_MAX_REPORTS = 100

/** 默认性能诊断最大时长，避免一次采集长时间占用浏览器资源。 */
export const DEFAULT_PERFORMANCE_MAX_DURATION_MS = 30_000

/** 默认性能诊断采样间隔，兼顾趋势判断和额外采样开销。 */
export const DEFAULT_PERFORMANCE_SAMPLE_INTERVAL_MS = 250

/** 默认长任务阈值，沿用浏览器 Long Task 的常见卡顿判断口径。 */
export const DEFAULT_PERFORMANCE_LONG_TASK_THRESHOLD_MS = 50

/** MCP 工具名集中管理，避免工具注册和测试中出现拼写漂移。 */
export const MCP_TOOL_NAMES = {
  listPages: 'list_pages',
  reloadPage: 'reload_page',
  getDomTree: 'get_dom_tree',
  queryDom: 'query_dom',
  takeScreenshot: 'take_screenshot',
  getConsoleLogs: 'get_console_logs',
  clearConsoleLogs: 'clear_console_logs',
  inspectConsoleArg: 'inspect_console_arg',
  evaluateScript: 'evaluate_script',
  getNetworkRequests: 'get_network_requests',
  getNetworkRequestDetail: 'get_network_request_detail',
  clearNetworkRequests: 'clear_network_requests',
  listStorage: 'list_storage',
  getStorageItem: 'get_storage_item',
  setStorageItem: 'set_storage_item',
  deleteStorageItem: 'delete_storage_item',
  clearStorage: 'clear_storage',
  recordPerformance: 'record_performance',
  startPerformanceRecording: 'start_performance_recording',
  stopPerformanceRecording: 'stop_performance_recording',
  getPerformanceReport: 'get_performance_report',
  takeHeapSnapshot: 'take_heap_snapshot',
  getComponentTree: 'get_component_tree',
  getComponentState: 'get_component_state',
  editComponentState: 'edit_component_state',
  highlightComponent: 'highlight_component',
  getRouterInfo: 'get_router_info',
  getPiniaTree: 'get_pinia_tree',
  getPiniaState: 'get_pinia_state',
  getElementContext: 'get_element_context'
} as const

/** 虚拟模块 ID 集中管理，便于注入逻辑和测试复用。 */
export const VIRTUAL_RUNTIME_ID = 'virtual:vite-plugin-vue-mcp-next/runtime'

/** Vite 内部解析虚拟模块时需要使用的空字节前缀。 */
export const RESOLVED_VIRTUAL_RUNTIME_ID = `\0${VIRTUAL_RUNTIME_ID}`

/** snapdom 扩展虚拟模块 ID，用静态 import 支持 Vite alias 和源码转换。 */
export const VIRTUAL_SCREENSHOT_CONFIG_ID =
  'virtual:vite-plugin-vue-mcp-next/screenshot-config'

/** Vite 内部解析截图配置虚拟模块时使用空字节前缀，避免与真实文件冲突。 */
export const RESOLVED_VIRTUAL_SCREENSHOT_CONFIG_ID = `\0${VIRTUAL_SCREENSHOT_CONFIG_ID}`

/** snapdom loader 虚拟模块 ID，用于把 optional peer 解析限制在宿主 Vite 模块图里。 */
export const VIRTUAL_SNAPDOM_LOADER_ID =
  'virtual:vite-plugin-vue-mcp-next/snapdom-loader'

/** Vite 内部解析 snapdom loader 时使用空字节前缀，避免与真实文件冲突。 */
export const RESOLVED_VIRTUAL_SNAPDOM_LOADER_ID = `\0${VIRTUAL_SNAPDOM_LOADER_ID}`

/** 默认 MCP 客户端服务名，采用 Vite 维度命名以匹配插件能力边界。 */
export const DEFAULT_MCP_CLIENT_SERVER_NAME = 'vite-mcp-next'

/** 旧默认服务名只用于迁移已有配置，避免用户项目里同时出现新旧两份 MCP 配置。 */
export const LEGACY_MCP_CLIENT_SERVER_NAMES = ['vue-mcp-next'] as const

/** Runtime 页面重连事件名，供 reload_page 等待页面刷新后重新接入。 */
export const RUNTIME_PAGE_RECONNECTED_EVENT =
  'vite-plugin-vue-mcp-next:page-reconnected'

/** Runtime 页面连接事件名，供 runtime client 启动时上报页面进入。 */
export const RUNTIME_PAGE_CONNECTED_EVENT =
  'vite-plugin-vue-mcp-next:page-connected'

/** Runtime 页面断开事件名，供页面卸载时主动通知服务端清理目标。 */
export const RUNTIME_PAGE_DISCONNECTED_EVENT =
  'vite-plugin-vue-mcp-next:page-disconnected'

/** Runtime 页面心跳事件名，供服务端兜底判断页面是否失活。 */
export const RUNTIME_PAGE_HEARTBEAT_EVENT =
  'vite-plugin-vue-mcp-next:heartbeat'

/** Runtime 页面心跳间隔，保持较低流量并覆盖正常关闭场景。 */
export const DEFAULT_RUNTIME_PAGE_HEARTBEAT_INTERVAL_MS = 15_000

/** Runtime 页面失活阈值，留出心跳抖动和短暂阻塞的缓冲。 */
export const DEFAULT_RUNTIME_PAGE_HEARTBEAT_TIMEOUT_MS = 45_000

/** Runtime 页面兜底扫描间隔，和失活阈值保持一致以减少无意义轮询。 */
export const DEFAULT_RUNTIME_PAGE_HEARTBEAT_SCAN_INTERVAL_MS = 45_000

/** 元素选择器轻提示默认时长，足够用户看清复制结果且不长期遮挡页面。 */
export const DEFAULT_ELEMENT_PICKER_TOAST_DURATION_MS = 2_200

/** 安全默认值，优先保证调试工具不会默认暴露危险能力。 */
export const DEFAULT_OPTIONS: ResolvedVueMcpNextOptions = {
  mcpPath: DEFAULT_MCP_PATH,
  host: 'localhost',
  printUrl: true,
  updateCursorMcpJson: {
    enabled: true,
    serverName: DEFAULT_MCP_CLIENT_SERVER_NAME
  },
  mcpClients: {
    cursor: true,
    codex: true,
    claudeCode: true,
    trae: true,
    serverName: DEFAULT_MCP_CLIENT_SERVER_NAME
  },
  skill: {
    autoConfig: true
  },
  elementPicker: {
    enabled: true,
    shortcut: {
      altKey: true,
      shiftKey: true,
      metaKey: false,
      ctrlKey: false
    },
    toastDurationMs: DEFAULT_ELEMENT_PICKER_TOAST_DURATION_MS
  },
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
  },
  screenshot: {
    type: 'path',
    saveDir: DEFAULT_SCREENSHOT_SAVE_DIR,
    prefer: 'auto',
    maxBytes: DEFAULT_SCREENSHOT_MAX_BYTES,
    snapdom: {
      options: {},
      plugins: []
    }
  },
  performance: {
    mode: 'auto',
    maxDurationMs: DEFAULT_PERFORMANCE_MAX_DURATION_MS,
    sampleIntervalMs: DEFAULT_PERFORMANCE_SAMPLE_INTERVAL_MS,
    longTaskThresholdMs: DEFAULT_PERFORMANCE_LONG_TASK_THRESHOLD_MS,
    saveDir: DEFAULT_PERFORMANCE_SAVE_DIR,
    memory: {
      enabled: true
    },
    stacks: {
      enabled: true
    }
  }
}

/**
 * 兼容旧 Cursor 配置并合并新多客户端配置。
 *
 * `updateCursorMcpJson` 已经公开给用户，不能直接删除；这里让旧配置继续影响 Cursor，
 * 同时允许 `mcpClients` 作为新入口覆盖默认行为。
 */
function mergeMcpClientOptions(
  cursorConfig: ResolvedVueMcpNextOptions['updateCursorMcpJson'],
  mcpClients?: McpClientConfigOptions
): Required<McpClientConfigOptions> {
  return {
    ...DEFAULT_OPTIONS.mcpClients,
    cursor: cursorConfig.enabled,
    serverName: cursorConfig.serverName,
    ...mcpClients
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
  const mcpClients = mergeMcpClientOptions(cursorConfig, options.mcpClients)

  return {
    ...DEFAULT_OPTIONS,
    ...options,
    updateCursorMcpJson: cursorConfig,
    mcpClients,
    skill: {
      ...DEFAULT_OPTIONS.skill,
      ...options.skill
    },
    elementPicker: {
      ...DEFAULT_OPTIONS.elementPicker,
      ...options.elementPicker,
      shortcut: {
        ...DEFAULT_OPTIONS.elementPicker.shortcut,
        ...options.elementPicker?.shortcut
      }
    },
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
    },
    screenshot: {
      ...DEFAULT_OPTIONS.screenshot,
      ...options.screenshot,
      snapdom: {
        ...DEFAULT_OPTIONS.screenshot.snapdom,
        ...options.screenshot?.snapdom,
        options: {
          ...DEFAULT_OPTIONS.screenshot.snapdom.options,
          ...options.screenshot?.snapdom?.options
        },
        plugins: options.screenshot?.snapdom?.plugins ?? [
          ...DEFAULT_OPTIONS.screenshot.snapdom.plugins
        ]
      }
    },
    performance: {
      ...DEFAULT_OPTIONS.performance,
      ...options.performance,
      memory: {
        ...DEFAULT_OPTIONS.performance.memory,
        ...options.performance?.memory
      },
      stacks: {
        ...DEFAULT_OPTIONS.performance.stacks,
        ...options.performance?.stacks
      }
    }
  }
}
