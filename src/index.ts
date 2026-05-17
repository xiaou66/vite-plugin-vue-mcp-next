/**
 * vite-plugin-vue-mcp-next 的公开入口。
 *
 * 入口文件只负责导出插件工厂和类型，具体实现放在 `plugin/createPlugin`，
 * 避免后续 MCP、CDP、Runtime 逻辑把公开 API 文件变成大文件。
 */
export { vueMcpNext, vueMcpNext as default } from './plugin/createPlugin'
export type {
  CdpOptions,
  ConsoleOptions,
  ConsoleRecord,
  CursorMcpConfig,
  DomOptions,
  EvaluateOptions,
  McpClientConfigOptions,
  NetworkOptions,
  NetworkRecord,
  PageTarget,
  ResolvedVueMcpNextOptions,
  RuntimeMode,
  RuntimeOptions,
  SkillConfigOptions,
  VueMcpNextContext,
  VueMcpNextOptions
} from './types'
