/**
 * AI 使用指南生成文件写入工具。
 *
 * 该模块只负责写入插件拥有的 skill/rule 文件，适用于 Vite dev server 启动时补充 AI 客户端上下文；
 * 写入内容直接来自随包发布的指南文件，避免在运行时拼接正文导致不同客户端解析行为不一致。
 */
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * 自动生成文本文件写入参数。
 *
 * 使用对象参数是为了后续扩展 dry-run、日志策略或生成来源时不破坏调用方签名。
 */
export interface WriteGeneratedTextFileOptions {
  /** 目标文件路径，调用方负责按客户端规则传入项目级路径。 */
  readonly filePath: string
  /** 完整文件内容，由调用方提供已适配目标 AI 客户端的文本。 */
  readonly content: string
  /** 日志中的目标名称，用于用户定位是哪类客户端配置被跳过。 */
  readonly targetName: string
}

/**
 * 写入插件拥有的生成文件。
 *
 * 自动配置的目标路径固定属于本插件的指南入口，因此这里直接覆盖旧内容；
 * 不再向正文写入所有权标记，避免 AI 工具把标记注释当作 Skill 内容解析。
 */
export async function writeGeneratedTextFile(
  options: WriteGeneratedTextFileOptions
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(options.filePath), { recursive: true })
    await fs.writeFile(options.filePath, options.content)
  } catch (error) {
    console.warn(
      `[vite-plugin-vue-mcp-next] Failed to update ${options.targetName} at ${options.filePath}: ${formatError(error)}`
    )
  }
}

/**
 * 格式化未知错误。
 *
 * 文件写入失败只进入 Vite 启动警告，统一转成字符串可以避免 unknown 直接泄漏到日志格式中。
 */
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
