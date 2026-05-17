/**
 * MCP 客户端配置编排模块。
 *
 * 这里负责判断当前项目应该写入哪些客户端配置；真正的 JSON/TOML 写入仍由独立 writer 负责，
 * 这样可以把“是否应该写”和“如何安全写”分开测试，避免自动探测误改用户已有配置。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_MCP_CLIENT_SERVER_NAME,
  LEGACY_MCP_CLIENT_SERVER_NAMES
} from '../../constants'
import type {
  ResolvedVueMcpNextOptions,
  VueMcpNextOptions
} from '../../types'
import { updateCodexMcpClientConfig } from './codexConfig'
import { updateJsonMcpClientConfig } from './jsonConfig'

export { updateCodexMcpClientConfig } from './codexConfig'
export { updateJsonMcpClientConfig } from './jsonConfig'

/** 多客户端 MCP 写入器只需要 resolved 后的 mcpClients 字段，测试可直接传入该字段。 */
export type ResolvedMcpClientConfigOptions =
  ResolvedVueMcpNextOptions['mcpClients']

/** 支持自动写入项目级 MCP 配置的客户端名称。 */
type McpClientName = 'cursor' | 'codex' | 'claudeCode' | 'trae'

/** 客户端入口类型用于区分目录型入口和文件型入口。 */
type ClientEntryKind = 'directory' | 'file'

/** 单个客户端的写入决策上下文，使用对象参数避免后续增加字段时拉长参数列表。 */
interface ClientUpdateDecisionOptions {
  /** 项目根目录，所有客户端入口都基于该目录判断。 */
  readonly root: string
  /** 当前客户端名称，用于查找用户是否显式配置。 */
  readonly clientName: McpClientName
  /** 解析后的开关值，`false` 表示无条件跳过。 */
  readonly enabled: boolean
  /** 自动探测使用的项目入口路径。 */
  readonly entryPath: string
  /** 入口类型，目录型客户端不能被同名文件误判为已启用。 */
  readonly entryKind: ClientEntryKind
  /** 用户原始配置，用于区分默认启用和显式启用。 */
  readonly userOptions: VueMcpNextOptions
}

/** 单个 MCP 客户端的配置写入描述，统一承载探测入口和实际写入动作。 */
interface ClientConfigDescriptor extends ClientUpdateDecisionOptions {
  /** 通过探测后执行的配置写入任务。 */
  readonly createJob: () => Promise<void>
}

/**
 * 更新所有启用的项目级 MCP 客户端配置。
 *
 * 自动配置属于开发体验增强；每个客户端独立处理错误，避免某个配置文件损坏时影响 Vite 启动。
 */
export async function updateMcpClientConfigs(
  root: string,
  sseUrl: string,
  streamableHttpUrl: string,
  options: ResolvedMcpClientConfigOptions,
  userOptions: VueMcpNextOptions = {}
): Promise<void> {
  const serverName = options.serverName
  const legacyServerNames = getLegacyServerNames(serverName)
  const descriptors: readonly ClientConfigDescriptor[] = [
    {
      root,
      clientName: 'cursor',
      enabled: options.cursor,
      entryPath: path.join(root, '.cursor'),
      entryKind: 'directory',
      userOptions,
      createJob: () =>
        updateJsonMcpClientConfig({
          clientName: 'Cursor',
          configPath: path.join(root, '.cursor', 'mcp.json'),
          mcpUrl: sseUrl,
          serverName,
          legacyServerNames
        })
    },
    {
      root,
      clientName: 'codex',
      enabled: options.codex,
      entryPath: path.join(root, '.codex'),
      entryKind: 'directory',
      userOptions,
      createJob: () =>
        updateCodexMcpClientConfig({
          configPath: path.join(root, '.codex', 'config.toml'),
          mcpUrl: streamableHttpUrl,
          serverName,
          legacyServerNames
        })
    },
    {
      root,
      clientName: 'claudeCode',
      enabled: options.claudeCode,
      entryPath: path.join(root, '.mcp.json'),
      entryKind: 'file',
      userOptions,
      createJob: () =>
        updateJsonMcpClientConfig({
          clientName: 'Claude Code',
          configPath: path.join(root, '.mcp.json'),
          mcpUrl: sseUrl,
          serverName,
          legacyServerNames
        })
    },
    {
      root,
      clientName: 'trae',
      enabled: options.trae,
      entryPath: path.join(root, '.trae'),
      entryKind: 'directory',
      userOptions,
      createJob: () =>
        updateJsonMcpClientConfig({
          clientName: 'Trae',
          configPath: path.join(root, '.trae', 'mcp.json'),
          mcpUrl: sseUrl,
          serverName,
          legacyServerNames
        })
    }
  ]

  const jobs = await createClientConfigJobs(descriptors)
  await Promise.all(jobs)
}

async function createClientConfigJobs(
  descriptors: readonly ClientConfigDescriptor[]
): Promise<Promise<void>[]> {
  const jobs: Promise<void>[] = []

  for (const descriptor of descriptors) {
    if (await shouldUpdateClientConfig(descriptor)) {
      jobs.push(descriptor.createJob())
    }
  }

  return jobs
}

/**
 * 只有默认服务名使用旧名迁移。
 *
 * 用户显式配置自定义 `serverName` 时应按自定义名创建，不能被历史默认名阻断。
 */
function getLegacyServerNames(serverName: string): readonly string[] {
  return serverName === DEFAULT_MCP_CLIENT_SERVER_NAME
    ? LEGACY_MCP_CLIENT_SERVER_NAMES
    : []
}

/**
 * 判断某个客户端本次是否应该尝试写入配置。
 *
 * 默认启用只代表“允许自动探测”；只有用户显式传 `true` 才代表强制创建，
 * 这样可以避免一个普通 Vite 项目启动后被创建所有 AI 客户端配置目录。
 */
async function shouldUpdateClientConfig(
  options: ClientUpdateDecisionOptions
): Promise<boolean> {
  if (!options.enabled) {
    return false
  }

  if (isClientExplicitlyConfigured(options.clientName, options.userOptions)) {
    return true
  }

  return hasExpectedEntry(options.entryPath, options.entryKind)
}

/**
 * 判断客户端开关是否来自用户显式配置。
 *
 * Cursor 需要兼容旧的 `updateCursorMcpJson`，因为旧入口本身就表达了用户对 Cursor 配置的明确意图。
 */
function isClientExplicitlyConfigured(
  clientName: McpClientName,
  userOptions: VueMcpNextOptions
): boolean {
  if (Object.hasOwn(userOptions.mcpClients ?? {}, clientName)) {
    return true
  }

  return clientName === 'cursor' && userOptions.updateCursorMcpJson !== undefined
}

/**
 * 检查项目中是否已经存在对应客户端入口。
 *
 * 目录型入口必须真的是目录，文件型入口必须真的是文件，避免同名异常文件导致插件误写配置。
 */
async function hasExpectedEntry(
  entryPath: string,
  entryKind: ClientEntryKind
): Promise<boolean> {
  try {
    const stat = await fs.stat(entryPath)
    return entryKind === 'directory' ? stat.isDirectory() : stat.isFile()
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false
    }

    console.warn(
      `[vite-plugin-vue-mcp-next] Failed to inspect MCP client entry at ${entryPath}: ${formatError(error)}`
    )
    return false
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
