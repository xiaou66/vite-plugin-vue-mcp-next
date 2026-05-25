/**
 * runtime 元素上下文解析。
 *
 * 该模块把 elementId 转换成 AI 可消费的源码、组件和 DOM 摘要；
 * 它优先返回项目源码位置，第三方包和 runtime 兜底都显式给出不可编辑边界。
 */

import { parseElementId } from '../shared/elementId'
import type { ParsedElementId } from '../shared/elementId'
import type { ElementContextResult } from '../types'
import { createDomElementSummary } from './domSnapshot'
import { runtimeElementRegistry } from './elementRegistry'
import type { RuntimeElementRegistry } from './elementRegistry'
import { locateVueComponentForElement } from './vueComponentLocator'

/**
 * 元素上下文解析器配置。
 *
 * querySelector 由调用方注入，便于测试和 runtime RPC 共享同一套解析逻辑。
 */
export interface ElementContextResolverOptions {
  readonly root: string
  readonly registry: RuntimeElementRegistry
  readonly querySelector: (selector: string) => Element | null
}

type ElementContextResolver = ReturnType<typeof createElementContextResolver>

let activeResolver: ElementContextResolver | undefined

/**
 * 创建 runtime 元素上下文解析器。
 *
 * 解析器优先返回可修改源码位置；只有拿不到项目源码时，才降级为第三方包或 runtime 限制说明。
 */
export function createElementContextResolver(
  options: ElementContextResolverOptions
) {
  return {
    getElementContext(elementId: string): ElementContextResult {
      const parsed = parseElementId(elementId)

      if (parsed.kind === 'project-source') {
        const element = options.querySelector(
          `[data-v-mcp-id="${escapeSelector(elementId)}"]`
        )

        return createProjectSourceContext(parsed, element, options.root)
      }

      if (parsed.kind === 'package') {
        return createPackageContext(parsed)
      }

      if (parsed.kind === 'runtime') {
        const record = options.registry.get(elementId)

        if (!record) {
          return createMissingRuntimeElementError(elementId)
        }

        return createRuntimeContext(elementId, record.element, options.root)
      }

      return {
        ok: false,
        error: parsed.reason,
        elementId,
        limitations: ['please provide a copied elementId from the element picker']
      }
    }
  }
}

/**
 * 设置当前页面使用的元素上下文解析器。
 *
 * runtime 启动后可注入共享 registry；测试也可以通过该入口隔离 DOM 查询来源。
 */
export function setElementContextResolver(
  resolver: ElementContextResolver
): void {
  activeResolver = resolver
}

/**
 * 获取当前页面元素上下文解析器。
 *
 * 未显式设置时创建浏览器默认解析器，保证 runtime RPC 在普通页面中可直接工作。
 */
export function getElementContextResolver(): ElementContextResolver {
  activeResolver ??= createElementContextResolver({
    root: '/',
    registry: runtimeElementRegistry,
    querySelector(selector) {
      return document.querySelector(selector)
    }
  })

  return activeResolver
}

/**
 * 创建项目源码上下文。
 *
 * 即使当前 DOM 查不到，编译期 ID 仍然可编辑；DOM 和组件信息只是增强上下文。
 */
function createProjectSourceContext(
  parsed: Extract<ParsedElementId, { kind: 'project-source' }>,
  element: Element | null,
  root: string
): ElementContextResult {
  return {
    ok: true,
    elementId: parsed.elementId,
    editable: true,
    codeLocation: {
      file: parsed.file,
      line: parsed.line,
      column: parsed.column
    },
    ...(element ? { component: locateVueComponentForElement(element, root) } : {}),
    ...(element ? { dom: createDomElementSummary(element) } : {}),
    limitations: element ? [] : ['runtime DOM element was not found']
  }
}

/**
 * 创建第三方包上下文。
 *
 * 包级结果明确不可编辑，AI 应回到项目源码中调整用法，而不是修改依赖包文件。
 */
function createPackageContext(
  parsed: Extract<ParsedElementId, { kind: 'package' }>
): ElementContextResult {
  return {
    ok: true,
    elementId: parsed.elementId,
    editable: false,
    packageLocation: {
      packageName: parsed.packageName,
      entryFile: parsed.entryFile
    },
    limitations: ['third-party package source is not editable from this project']
  }
}

/**
 * 创建 runtime fallback 上下文。
 *
 * 动态 DOM 只有在能反查到项目组件源码时才标记可编辑，否则仅返回 DOM 摘要和限制说明。
 */
function createRuntimeContext(
  elementId: string,
  element: Element,
  root: string
): ElementContextResult {
  const component = locateVueComponentForElement(element, root)
  const sourceFile = component?.source?.file

  return {
    ok: true,
    elementId,
    editable: Boolean(sourceFile),
    ...(sourceFile
      ? { codeLocation: { file: sourceFile, line: 1, column: 1 } }
      : {}),
    component,
    dom: createDomElementSummary(element),
    limitations: sourceFile
      ? ['runtime id maps to nearest component file, exact template node is unavailable']
      : ['runtime id is only valid during the current page lifecycle']
  }
}

/**
 * 创建 runtime ID 失效错误。
 *
 * 失效通常来自页面刷新或 DOM 被移除，必须提示用户重新选择元素。
 */
function createMissingRuntimeElementError(elementId: string): ElementContextResult {
  return {
    ok: false,
    error: 'element not found',
    elementId,
    limitations: [
      'element was removed or page refreshed',
      'please ask the user to pick the element again'
    ]
  }
}

/**
 * 转义属性选择器值。
 *
 * 浏览器支持 `CSS.escape` 时优先使用；测试或旧环境中使用保守转义，避免 ID 中的引号破坏选择器。
 */
function escapeSelector(value: string): string {
  const css = (globalThis as {
    readonly CSS?: { readonly escape?: (input: string) => string }
  }).CSS

  if (css?.escape) {
    return css.escape(value)
  }

  return value.replace(/["\\]/g, '\\$&')
}
