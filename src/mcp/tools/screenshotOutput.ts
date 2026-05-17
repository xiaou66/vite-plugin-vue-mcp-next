/**
 * 服务端截图输出工具。
 *
 * CDP 与浏览器 runtime 都只能稳定产出图片数据，项目路径写入必须在 Vite dev server 侧统一处理。
 */
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  ResolvedVueMcpNextOptions,
  ScreenshotFormat,
  ScreenshotTarget
} from '../../types'

/** 截图来源，调用方需要用它解释 CDP 真截图与 snapdom DOM 截图的差异。 */
export type ScreenshotOutputSource = 'cdp' | 'snapdom'

/** 截图原始数据，输出 helper 会按项目配置转换为路径或 base64 响应。 */
export interface ScreenshotImagePayload {
  readonly [key: string]: unknown
  /** 截图来源，适合调用方判断截图可信度和限制。 */
  readonly source: ScreenshotOutputSource
  /** 截图范围，用于文件名和返回元数据。 */
  readonly target: ScreenshotTarget
  /** 图片格式，用于 mime type 和扩展名保持一致。 */
  readonly format: ScreenshotFormat
  /** 图片 base64 数据，不包含 data URL 前缀。 */
  readonly data: string
  /** 图片宽度，便于客户端展示和诊断。 */
  readonly width: number
  /** 图片高度，便于客户端展示和诊断。 */
  readonly height: number
  /** 图片 mime type，便于客户端解码。 */
  readonly mimeType: string
  /** 原始字节数，用于体积限制和结果说明。 */
  readonly byteLength: number
  /** runtime DOM 截图的已知限制，CDP 截图通常不需要该字段。 */
  readonly limitations?: readonly string[]
}

/** 路径输出结果，默认用于项目级 MCP，避免 base64 占用模型上下文。 */
export interface ScreenshotPathOutput
  extends Omit<ScreenshotImagePayload, 'data'> {
  /** 截图文件绝对路径，适合 MCP 客户端直接读取。 */
  readonly path: string
  /** 相对 Vite 项目根目录路径，适合用户在项目内定位。 */
  readonly relativePath: string
}

/** 截图输出结果，项目配置决定返回路径还是保留 base64 数据。 */
export type ScreenshotOutput = ScreenshotImagePayload | ScreenshotPathOutput

/** 截图输出所需的最小服务端上下文，避免把 helper 绑定到完整 ViteDevServer 实例。 */
export interface ScreenshotOutputContext {
  /** 已解析插件配置，输出策略只读取项目级截图配置。 */
  readonly options: ResolvedVueMcpNextOptions
  /** Vite 项目根目录来源，path 模式需要它解析相对 saveDir。 */
  readonly server?: {
    readonly config: {
      readonly root: string
    }
  }
}

/**
 * 创建截图输出。
 *
 * 该函数集中处理项目级输出策略，让 CDP 和 runtime 通道不关心文件系统细节。
 */
export async function createScreenshotOutput(
  ctx: ScreenshotOutputContext,
  payload: ScreenshotImagePayload
): Promise<ScreenshotOutput> {
  if (ctx.options.screenshot.type === 'base64') {
    return payload
  }

  const saveDir = resolveScreenshotSaveDir(ctx)
  await mkdir(saveDir, { recursive: true })
  const filePath = path.join(saveDir, createScreenshotFileName(payload))
  await writeFile(filePath, Buffer.from(payload.data, 'base64'))

  return {
    source: payload.source,
    target: payload.target,
    format: payload.format,
    width: payload.width,
    height: payload.height,
    mimeType: payload.mimeType,
    byteLength: payload.byteLength,
    limitations: payload.limitations,
    path: filePath,
    relativePath: createProjectRelativePath(ctx, filePath)
  }
}

/**
 * 解析截图保存目录。
 *
 * 相对路径必须基于 Vite root，而不是当前 shell 工作目录，否则 monorepo 中会写错项目位置。
 */
function resolveScreenshotSaveDir(
  ctx: ScreenshotOutputContext
): string {
  const saveDir = ctx.options.screenshot.saveDir.trim()

  if (!saveDir) {
    throw new Error('screenshot.saveDir must be a non-empty string')
  }

  const root = ctx.server?.config.root

  if (!root) {
    throw new Error('Vite server root is required for screenshot path output')
  }

  if (path.isAbsolute(saveDir)) {
    return saveDir
  }

  return path.resolve(root, saveDir)
}

/**
 * 生成截图文件名。
 *
 * 文件名只使用服务端生成的安全字段，避免 selector、URL 等外部输入污染路径。
 */
function createScreenshotFileName(payload: ScreenshotImagePayload): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const suffix = randomUUID().slice(0, 8)

  return `${timestamp}-${payload.source}-${payload.target}-${suffix}.${payload.format}`
}

/**
 * 生成项目相对路径。
 *
 * 返回值统一使用 `/`，让不同操作系统下的 MCP 结果更稳定。
 */
function createProjectRelativePath(
  ctx: ScreenshotOutputContext,
  filePath: string
): string {
  const root = ctx.server?.config.root

  if (!root) {
    throw new Error('Vite server root is required for screenshot path output')
  }

  return path.relative(root, filePath).split(path.sep).join('/')
}
