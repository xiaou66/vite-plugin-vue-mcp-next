import type { Plugin } from 'vite'

export interface VueMcpNextPluginOptions {
  /** 预留给后续开发态调试开关，当前模板不读取该配置 */
  readonly enabled?: boolean
}

export function vueMcpNext(_options: VueMcpNextPluginOptions = {}): Plugin {
  // 保留 options 入口，后续接入 MCP 调试能力时不需要破坏公开 API
  void _options

  return {
    name: 'vite-plugin-vue-mcp-next'
  }
}

export default vueMcpNext
