import fs from 'node:fs/promises'
import path from 'node:path'

/** Codex TOML 写入参数，集中承载可以避免后续扩展 env、headers 时增加位置参数。 */
export interface UpdateCodexMcpClientConfigOptions {
  /** 目标 `.codex/config.toml` 文件路径。 */
  readonly configPath: string
  /** 当前 Vite dev server 暴露给 Codex 的 Streamable HTTP 地址。 */
  readonly mcpUrl: string
  /** Codex 中展示的 MCP 服务名，只替换该服务对应 TOML 区块。 */
  readonly serverName: string
  /** 旧默认服务名列表，只用于迁移历史自动配置，不影响用户自定义服务名。 */
  readonly legacyServerNames?: readonly string[]
}

/**
 * 写入 Codex 项目级 MCP 配置。
 *
 * 这里不引入 TOML 解析依赖，是因为只需要追加本插件自己的区块；
 * 不覆盖已有同名区块可以保留用户手动配置的端口、路径或兼容性参数。
 */
export async function updateCodexMcpClientConfig(
  options: UpdateCodexMcpClientConfigOptions
): Promise<void> {
  try {
    const current = await readOptionalTextFile(options.configPath)
    const next = replaceOrAppendOwnedBlock(current, options)

    await fs.mkdir(path.dirname(options.configPath), { recursive: true })
    await fs.writeFile(options.configPath, next)
  } catch (error) {
    console.warn(
      `[vite-plugin-vue-mcp-next] Failed to update Codex MCP config at ${options.configPath}: ${formatError(error)}`
    )
  }
}

function replaceOrAppendOwnedBlock(
  current: string,
  options: UpdateCodexMcpClientConfigOptions
): string {
  const block = createCodexServerBlock(options)
  const matcher = createServerTableMatcher(options.serverName)

  if (matcher.test(current)) {
    return ensureTrailingNewline(current)
  }

  const legacyServerName = options.legacyServerNames?.find((serverName) =>
    createServerTableMatcher(serverName).test(current)
  )
  if (legacyServerName) {
    return ensureTrailingNewline(
      renameServerTableHeaders(current, legacyServerName, options.serverName)
    )
  }

  const separator = current.trim() ? '\n\n' : ''
  return `${trimEndNewline(current)}${separator}${block}`
}

function createCodexServerBlock(
  options: UpdateCodexMcpClientConfigOptions
): string {
  return `${createTableHeader(options.serverName)}\nurl = ${quoteTomlString(options.mcpUrl)}\n`
}

function createServerTableMatcher(serverName: string): RegExp {
  const plainHeader = escapeRegExp(`[mcp_servers.${serverName}]`)
  const plainChildHeader = escapeRegExp(`[mcp_servers.${serverName}.`)
  const quotedHeader = escapeRegExp(
    `[mcp_servers.${quoteTomlKey(serverName)}]`
  )
  const quotedChildHeader = escapeRegExp(
    `[mcp_servers.${quoteTomlKey(serverName)}.`
  )

  return new RegExp(
    `(?:^|\\n)(?:${plainHeader}|${plainChildHeader}|${quotedHeader}|${quotedChildHeader})`
  )
}

function createTableHeader(serverName: string): string {
  const key = createTableKey(serverName)
  return `[mcp_servers.${key}]`
}

function createTableKey(serverName: string): string {
  return /^[A-Za-z0-9_-]+$/.test(serverName)
    ? serverName
    : quoteTomlKey(serverName)
}

function quoteTomlKey(value: string): string {
  return quoteTomlString(value)
}

function quoteTomlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * 重命名 Codex TOML 中本插件服务表头。
 *
 * 只替换表头中的服务名，保留 url、env、headers 等用户已有字段，避免迁移时改变真实连接参数。
 */
function renameServerTableHeaders(
  current: string,
  fromServerName: string,
  toServerName: string
): string {
  return current
    .split('\n')
    .map((line) => renameServerTableHeader(line, fromServerName, toServerName))
    .join('\n')
}

function renameServerTableHeader(
  line: string,
  fromServerName: string,
  toServerName: string
): string {
  const toKey = createTableKey(toServerName)
  const fromKeys = [fromServerName, quoteTomlKey(fromServerName)]

  for (const fromKey of fromKeys) {
    const prefix = `[mcp_servers.${fromKey}`
    const nextChar = line[prefix.length]

    if (line.startsWith(prefix) && (nextChar === ']' || nextChar === '.')) {
      return `[mcp_servers.${toKey}${line.slice(prefix.length)}`
    }
  }

  return line
}

async function readOptionalTextFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return ''
    }

    throw error
  }
}

function trimEndNewline(value: string): string {
  return value.replace(/\n+$/u, '')
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
