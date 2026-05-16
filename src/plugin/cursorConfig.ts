import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedVueMcpNextOptions } from '../types'

/**
 * 更新 Cursor MCP 配置。
 *
 * 该功能只在 `.cursor` 已存在时写入配置，避免插件擅自改变未启用 Cursor 的项目结构。
 */
export async function updateCursorMcpConfig(
  root: string,
  mcpUrl: string,
  options: ResolvedVueMcpNextOptions
): Promise<void> {
  if (!options.updateCursorMcpJson.enabled) {
    return
  }

  const cursorDir = path.join(root, '.cursor')

  if (!fsSync.existsSync(cursorDir)) {
    return
  }

  const configPath = path.join(cursorDir, 'mcp.json')
  const raw = fsSync.existsSync(configPath)
    ? await fs.readFile(configPath, 'utf-8')
    : '{}'
  const config = raw.trim() ? (JSON.parse(raw) as CursorMcpJson) : {}

  config.mcpServers ??= {}
  config.mcpServers[options.updateCursorMcpJson.serverName] = { url: mcpUrl }

  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
}

/**
 * Cursor MCP JSON 的最小结构。
 *
 * 只声明本插件需要读写的字段，避免把编辑器配置的其他未知字段错误收窄或丢弃。
 */
interface CursorMcpJson {
  /** Cursor 识别的 MCP 服务表，本插件只按 serverName 写入自己的条目。 */
  mcpServers?: Record<string, { url: string }>
}
