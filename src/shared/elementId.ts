/**
 * 元素 ID 共享解析契约。
 *
 * 该文件只处理字符串格式分类，不访问 DOM、runtime 或文件系统；
 * 这样 MCP 在浏览器页面不在线时，仍能基于用户提供的 ID 返回明确边界。
 */

const PROJECT_SOURCE_ID_PATTERN = /^(.+\.(?:vue|tsx|jsx|ts|js)):(\d+):(\d+)$/
const RUNTIME_ID_PATTERN = /^runtime:([A-Za-z0-9_-]+)$/
const PACKAGE_ID_PREFIX = 'pkg:'

/**
 * 元素 ID 解析结果。
 *
 * `project-source` 表示可定位到项目源码；`package` 只表达第三方包入口；
 * `runtime` 依赖当前页面生命周期；`invalid` 用于给 AI 返回可解释错误。
 */
export type ParsedElementId =
  | {
      readonly kind: 'project-source'
      readonly elementId: string
      readonly file: string
      readonly line: number
      readonly column: number
    }
  | {
      readonly kind: 'package'
      readonly elementId: string
      readonly packageName: string
      readonly entryFile: string
    }
  | {
      readonly kind: 'runtime'
      readonly elementId: string
      readonly runtimeId: string
    }
  | {
      readonly kind: 'invalid'
      readonly elementId: string
      readonly reason: string
    }

/**
 * 解析用户复制给 AI 的元素标识。
 *
 * 该函数只负责格式分类，不判断文件是否存在，也不推断 DOM 是否仍在页面上；
 * 这些上下文需要由 runtime 或 MCP 上层工具补齐。
 */
export function parseElementId(elementId: string): ParsedElementId {
  const sourceMatch = PROJECT_SOURCE_ID_PATTERN.exec(elementId)

  if (sourceMatch) {
    return {
      kind: 'project-source',
      elementId,
      file: sourceMatch[1],
      line: Number(sourceMatch[2]),
      column: Number(sourceMatch[3])
    }
  }

  if (elementId.startsWith(PACKAGE_ID_PREFIX)) {
    return parsePackageElementId(elementId)
  }

  const runtimeMatch = RUNTIME_ID_PATTERN.exec(elementId)

  if (runtimeMatch) {
    return {
      kind: 'runtime',
      elementId,
      runtimeId: runtimeMatch[1]
    }
  }

  return {
    kind: 'invalid',
    elementId,
    reason: 'unsupported elementId format'
  }
}

/**
 * 解析第三方包元素标识。
 *
 * scope 包需要把前两段作为包名，避免把 `@scope/ui/Button` 错切成 `@scope`；
 * 包级 ID 不返回 `node_modules` 物理路径，避免引导 AI 修改依赖源码。
 */
function parsePackageElementId(elementId: string): ParsedElementId {
  const value = elementId.slice(PACKAGE_ID_PREFIX.length)
  const parts = value.split('/').filter(Boolean)

  if (parts.length < 2) {
    return {
      kind: 'invalid',
      elementId,
      reason: 'package elementId must include packageName and entryFile'
    }
  }

  const scoped = parts[0]?.startsWith('@')
  const packageName = scoped ? parts.slice(0, 2).join('/') : parts[0]
  const entryFile = parts.slice(scoped ? 2 : 1).join('/')

  if (!entryFile) {
    return {
      kind: 'invalid',
      elementId,
      reason: 'package elementId must include entryFile'
    }
  }

  return {
    kind: 'package',
    elementId,
    packageName,
    entryFile
  }
}
