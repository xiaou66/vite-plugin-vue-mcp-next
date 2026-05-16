import path from 'node:path'
import type { ResolvedVueMcpNextOptions } from '../../types'
import { updateCodexMcpClientConfig } from './codexConfig'
import { updateJsonMcpClientConfig } from './jsonConfig'

export { updateCodexMcpClientConfig } from './codexConfig'
export { updateJsonMcpClientConfig } from './jsonConfig'

/** 多客户端 MCP 写入器只需要 resolved 后的 mcpClients 字段，测试可直接传入该字段。 */
export type ResolvedMcpClientConfigOptions =
  ResolvedVueMcpNextOptions['mcpClients']

/**
 * 更新所有启用的项目级 MCP 客户端配置。
 *
 * 自动配置属于开发体验增强；每个客户端独立处理错误，避免某个配置文件损坏时影响 Vite 启动。
 */
export async function updateMcpClientConfigs(
  root: string,
  mcpUrl: string,
  options: ResolvedMcpClientConfigOptions
): Promise<void> {
  const serverName = options.serverName
  const jobs: Promise<void>[] = []

  if (options.cursor) {
    jobs.push(
      updateJsonMcpClientConfig({
        clientName: 'Cursor',
        configPath: path.join(root, '.cursor', 'mcp.json'),
        mcpUrl,
        serverName
      })
    )
  }

  if (options.codex) {
    jobs.push(
      updateCodexMcpClientConfig({
        configPath: path.join(root, '.codex', 'config.toml'),
        mcpUrl,
        serverName
      })
    )
  }

  if (options.claudeCode) {
    jobs.push(
      updateJsonMcpClientConfig({
        clientName: 'Claude Code',
        configPath: path.join(root, '.mcp.json'),
        mcpUrl,
        serverName
      })
    )
  }

  if (options.trae) {
    jobs.push(
      updateJsonMcpClientConfig({
        clientName: 'Trae',
        configPath: path.join(root, '.trae', 'mcp.json'),
        mcpUrl,
        serverName
      })
    )
  }

  await Promise.all(jobs)
}
