import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ViteDevServer } from 'vite'
import type { VueMcpNextContext } from '../types'
import { registerConsoleTools } from './tools/console'
import { registerDomTools } from './tools/dom'
import { registerEvaluateTools } from './tools/evaluate'
import { registerNetworkTools } from './tools/network'
import { registerPageTools } from './tools/pages'
import { registerScreenshotTools } from './tools/screenshot'
import { registerVueTools } from './tools/vue'

/**
 * 创建 MCP Server 并注册所有工具。
 *
 * MCP 工具注册集中在这里，便于审查最终暴露给 AI 的能力范围，
 * 也方便后续按配置关闭高风险工具。
 */
export function createMcpServer(
  ctx: VueMcpNextContext,
  vite: ViteDevServer
): McpServer {
  const server = new McpServer({
    name: 'vite-plugin-vue-mcp-next',
    version: '0.0.0'
  })

  registerPageTools(server, ctx, vite)
  registerDomTools(server, ctx)
  registerScreenshotTools(server, ctx)
  registerConsoleTools(server, ctx)
  registerEvaluateTools(server, ctx)
  registerNetworkTools(server, ctx)
  registerVueTools(server, ctx)

  return server
}
