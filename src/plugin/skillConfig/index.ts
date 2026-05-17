import fs from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedVueMcpNextOptions } from '../../types'
import { writeGeneratedTextFile } from './writers'

const PACKAGE_NAME = '@xiaou66/vite-plugin-vue-mcp-next'
const PACKAGED_SKILL_PATH = path.join('skills', 'vite-mcp-next', 'SKILL.md')

/** AI 使用指南写入器只需要 resolved 后的 skill 字段，测试可直接传入该字段。 */
export type ResolvedSkillConfigOptions = ResolvedVueMcpNextOptions['skill']

/** 支持自动安装使用指南的客户端入口描述。 */
interface SkillConfigDescriptor {
  /** 入口目录存在时才自动安装，避免污染未使用的客户端配置。 */
  readonly entryPath: string
  /** 目标文件路径，只写本插件拥有的 skill/rule 文件。 */
  readonly filePath: string
  /** 日志目标名称，用于跳过或失败时定位。 */
  readonly targetName: string
}

/**
 * 自动安装 AI 使用指南。
 *
 * 该能力只增强 AI 客户端上下文，不参与 MCP 服务启动；任何写入失败都只记录警告，
 * 不能阻断 Vite dev server，因为调试服务本身仍然可以正常工作。
 */
export async function updateSkillConfigs(
  root: string,
  options: ResolvedSkillConfigOptions
): Promise<void> {
  if (!options.autoConfig) {
    return
  }

  const descriptors = createSkillConfigDescriptors(root)
  const skillContent = await safelyReadPackagedSkillContent(root)
  if (!skillContent) {
    return
  }

  const jobs = await createSkillConfigJobs(descriptors, skillContent)
  await Promise.all(jobs)
}

function createSkillConfigDescriptors(
  root: string
): readonly SkillConfigDescriptor[] {
  return [
    {
      entryPath: path.join(root, '.codex'),
      filePath: path.join(root, '.codex', 'skills', 'vite-mcp-next', 'SKILL.md'),
      targetName: 'Codex skill'
    },
    {
      entryPath: path.join(root, '.claude'),
      filePath: path.join(
        root,
        '.claude',
        'skills',
        'vite-mcp-next',
        'SKILL.md'
      ),
      targetName: 'Claude Code skill'
    },
    {
      entryPath: path.join(root, '.cursor'),
      filePath: path.join(root, '.cursor', 'rules', 'vite-mcp-next.mdc'),
      targetName: 'Cursor rule'
    }
  ]
}

async function createSkillConfigJobs(
  descriptors: readonly SkillConfigDescriptor[],
  content: string
): Promise<Promise<void>[]> {
  const jobs: Promise<void>[] = []

  for (const descriptor of descriptors) {
    if (await hasDirectoryEntry(descriptor.entryPath)) {
      jobs.push(
        writeGeneratedTextFile({
          filePath: descriptor.filePath,
          content,
          targetName: descriptor.targetName
        })
      )
    }
  }

  return jobs
}

/**
 * 读取随 npm 包发布的静态 Skill 文件。
 *
 * 开发态通过源码路径读取项目根目录 `skills`；构建后通过 `dist/index.js` 相邻的包根目录读取，
 * 避免把 Skill 正文硬编码到 TypeScript 字符串里，也让发布包中的文件成为唯一内容来源。
 */
async function readPackagedSkillContent(root: string): Promise<string> {
  const candidates = getPackagedSkillCandidates(root)

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf-8')
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        continue
      }

      throw error
    }
  }

  throw new Error(
    `Cannot find packaged vite-mcp-next skill at ${candidates.join(', ')}`
  )
}

async function safelyReadPackagedSkillContent(
  root: string
): Promise<string | undefined> {
  try {
    return await readPackagedSkillContent(root)
  } catch (error) {
    console.warn(
      `[vite-plugin-vue-mcp-next] Failed to read packaged AI skill: ${formatError(error)}`
    )
    return undefined
  }
}

function getPackagedSkillCandidates(root: string): string[] {
  return [
    path.resolve(root, 'node_modules', PACKAGE_NAME, PACKAGED_SKILL_PATH),
    path.resolve(process.cwd(), 'node_modules', PACKAGE_NAME, PACKAGED_SKILL_PATH),
    path.resolve(process.cwd(), PACKAGED_SKILL_PATH)
  ]
}

async function hasDirectoryEntry(entryPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(entryPath)
    return stat.isDirectory()
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false
    }

    console.warn(
      `[vite-plugin-vue-mcp-next] Failed to inspect skill config entry at ${entryPath}: ${formatError(error)}`
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
