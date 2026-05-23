/**
 * 性能产物落盘 helper。
 *
 * CDP 侧原始 profile 和 heap snapshot 都可能很大，因此需要统一把它们写进项目目录并返回路径型结果。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { nanoid } from 'nanoid'
import type { PerformanceArtifact } from '../types'

/**
 * 落盘性能产物的输入。
 *
 * helper 只处理文件路径、字节大小和写入，不关心调用方是 CPU profile 还是 heap snapshot。
 */
export interface WritePerformanceArtifactOptions {
  /** 项目根目录。 */
  readonly root?: string
  /** 保存目录，相对路径按项目根目录解析。 */
  readonly saveDir: string
  /** 文件名，调用方负责决定扩展名和语义前缀。 */
  readonly fileName: string
  /** 产物类型。 */
  readonly kind: PerformanceArtifact['kind']
  /** 原始数据。 */
  readonly data: string | Buffer
}

/**
 * 把性能产物写入磁盘。
 *
 * 这个 helper 会创建保存目录、写入数据，并返回路径型 artifact，避免大对象直接进入 MCP 响应。
 */
export async function writePerformanceArtifact(
  options: WritePerformanceArtifactOptions
): Promise<PerformanceArtifact> {
  const root = resolve(options.root ?? process.cwd())
  const dir = resolveOutputDirectory(root, options.saveDir)
  const path = resolve(dir, createSafeFileName(options.fileName))
  const data = typeof options.data === 'string' ? Buffer.from(options.data) : options.data

  await mkdir(dir, { recursive: true })
  await writeFile(path, data)

  return {
    kind: options.kind,
    path,
    relativePath: relative(root, path),
    byteLength: data.byteLength,
    source: 'cdp'
  }
}

/**
 * 解析性能产物保存目录。
 *
 * 相对路径按项目根目录解析，绝对路径则原样保留，这样用户可以把重产物单独放到外部目录。
 */
function resolveOutputDirectory(root: string, saveDir: string): string {
  return resolve(root, saveDir)
}

/**
 * 生成安全文件名。
 *
 * 文件名允许调用方提供前缀，但会补一个短随机后缀，避免同一毫秒内重复写入发生冲突。
 */
function createSafeFileName(fileName: string): string {
  const trimmed = fileName.trim()

  if (!trimmed) {
    return `${String(Date.now())}-${nanoid()}`
  }

  const suffix = nanoid(6)
  const dotIndex = trimmed.lastIndexOf('.')

  if (dotIndex === -1) {
    return `${trimmed}-${suffix}`
  }

  const base = trimmed.slice(0, dotIndex)
  const extension = trimmed.slice(dotIndex)

  return `${base}-${suffix}${extension}`
}
