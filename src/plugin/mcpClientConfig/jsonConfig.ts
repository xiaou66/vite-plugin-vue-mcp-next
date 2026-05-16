import fs from 'node:fs/promises'
import path from 'node:path'

/** JSON MCP 配置写入参数，用对象承载可以避免客户端差异继续增加时拉长函数参数列表。 */
export interface UpdateJsonMcpClientConfigOptions {
  /** 客户端展示名，用于警告日志定位是哪一种配置失败。 */
  readonly clientName: string
  /** 目标配置文件路径，调用方负责传入项目级路径。 */
  readonly configPath: string
  /** 当前 Vite dev server 暴露的 MCP SSE 地址。 */
  readonly mcpUrl: string
  /** 写入 MCP 客户端的服务名，只更新该服务以保护用户已有配置。 */
  readonly serverName: string
}

/**
 * 写入 JSON 结构的项目级 MCP 配置。
 *
 * Cursor、Claude Code 和 Trae 都使用 `mcpServers` JSON 结构；共用该函数可以确保
 * “保留用户已有配置，只更新本插件条目”的行为在不同客户端中一致。
 */
export async function updateJsonMcpClientConfig(
  options: UpdateJsonMcpClientConfigOptions
): Promise<void> {
  try {
    const config = await readJsonConfig(options.configPath)

    if (!isPlainRecord(config)) {
      warnConfigFailure(options, 'config root must be a JSON object')
      return
    }

    const mcpServers = isPlainRecord(config.mcpServers)
      ? config.mcpServers
      : {}
    if (Object.hasOwn(mcpServers, options.serverName)) {
      return
    }

    mcpServers[options.serverName] = { type: 'sse', url: options.mcpUrl }
    config.mcpServers = mcpServers

    await fs.mkdir(path.dirname(options.configPath), { recursive: true })
    await fs.writeFile(
      options.configPath,
      `${JSON.stringify(config, null, 2)}\n`
    )
  } catch (error) {
    warnConfigFailure(options, formatError(error))
  }
}

async function readJsonConfig(configPath: string): Promise<unknown> {
  const raw = await readOptionalTextFile(configPath)

  if (!raw.trim()) {
    return {}
  }

  return JSON.parse(raw)
}

async function readOptionalTextFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return '{}'
    }

    throw error
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function warnConfigFailure(
  options: UpdateJsonMcpClientConfigOptions,
  reason: string
): void {
  console.warn(
    `[vite-plugin-vue-mcp-next] Failed to update ${options.clientName} MCP config at ${options.configPath}: ${reason}`
  )
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
