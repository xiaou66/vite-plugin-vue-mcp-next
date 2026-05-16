/**
 * 运行时采集的默认限制集中定义。
 *
 * DOM、Console 和 Network 都可能持续产生大量数据；把限制放在共享模块里，
 * 可以让服务端工具、运行时 Hook 和测试使用同一套安全边界。
 */

/** 默认 DOM 递归深度，保留主要结构，同时避免复杂页面把 MCP 上下文撑爆。 */
export const DEFAULT_DOM_MAX_DEPTH = 8

/** 默认 DOM 节点上限，用于防止一次性返回整页巨量节点。 */
export const DEFAULT_DOM_MAX_NODES = 2000

/** 默认文本截断长度，保留可定位内容但避免长文案污染调试上下文。 */
export const DEFAULT_DOM_MAX_TEXT_LENGTH = 300

/** 默认 Console 缓存上限，适合开发态持续运行且不会无界增长。 */
export const DEFAULT_CONSOLE_MAX_RECORDS = 1000

/** 默认 Network 缓存上限，覆盖常见调试窗口同时控制内存占用。 */
export const DEFAULT_NETWORK_MAX_RECORDS = 500

/** 默认请求体和响应体最大采集长度，避免大文件响应进入 MCP 工具结果。 */
export const DEFAULT_NETWORK_MAX_BODY_SIZE = 100_000

/**
 * 默认脱敏 header。
 *
 * 这些字段通常包含认证态或用户隐私，Network 工具默认隐藏它们可以降低误传风险。
 */
export const DEFAULT_MASK_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie'
] as const

/** 默认响应体截断标记，集中定义可以让 Hook 和 CDP 输出保持一致。 */
export const TRUNCATED_MARKER = '[truncated]'
