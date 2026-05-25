/**
 * Vue SFC 元素标识注入。
 *
 * 该模块只在 Vite dev transform 阶段处理项目源码，把稳定、可读的
 * `data-v-mcp-id` 写到模板元素上；runtime 和 MCP 依赖这个 ID 建立
 * “用户点击 DOM -> AI 定位源码”的协作链路。
 */

import { parse } from '@vue/compiler-sfc'
import MagicString from 'magic-string'
import { relative } from 'node:path'
import type { TransformResult } from 'vite'

const VUE_FILE_SUFFIX = '.vue'
const ELEMENT_NODE_TYPE = 1
const SKIPPED_TAGS = new Set(['template', 'slot', 'script', 'style'])
const MCP_ID_ATTR = 'data-v-mcp-id'

/**
 * 元素注入控制器。
 *
 * 返回 `undefined` 表示当前模块不适合注入，Vite 可继续走后续插件。
 */
export interface ElementInstrumentationController {
  transform(
    code: string,
    id: string,
    ssr?: boolean
  ): TransformResult | undefined
}

/**
 * 元素注入控制器配置。
 *
 * root 用于生成项目相对路径，避免把用户机器绝对路径暴露给 AI。
 */
export interface ElementInstrumentationOptions {
  readonly root: string
}

interface TemplateAstNode {
  readonly type: number
  readonly tag?: string
  readonly loc?: {
    readonly start: {
      readonly line: number
      readonly column: number
      readonly offset: number
    }
  }
  readonly props?: readonly unknown[]
  readonly children?: readonly TemplateAstNode[]
}

/**
 * 创建元素标识注入控制器。
 *
 * 该控制器只处理本地开发态的项目源码，第三方依赖和虚拟模块必须跳过，
 * 避免把调试属性写入外部包产物或 Vite 内部虚拟模块。
 */
export function createElementInstrumentationController(
  options: ElementInstrumentationOptions
): ElementInstrumentationController {
  return {
    transform(code, id, ssr) {
      if (ssr || shouldSkipInstrumentation(id)) {
        return undefined
      }

      const filename = id.split('?', 1)[0]

      if (!filename.endsWith(VUE_FILE_SUFFIX)) {
        return undefined
      }

      const parsed = parse(code, { filename })
      const template = parsed.descriptor.template

      if (!template?.ast) {
        return undefined
      }

      const s = new MagicString(code)
      const relativeFile = normalizePath(relative(options.root, filename))

      for (const node of template.ast.children) {
        injectNodeId(s, node as TemplateAstNode, relativeFile)
      }

      if (!s.hasChanged()) {
        return undefined
      }

      return {
        code: s.toString(),
        map: s.generateMap({ hires: true }) as TransformResult extends {
          map?: infer T
        }
          ? T
          : never
      }
    }
  }
}

/**
 * 判断当前 Vite 模块是否需要跳过注入。
 *
 * 过滤虚拟模块和 `node_modules` 是为了把源码定位限定在用户项目内；
 * SSR transform 由调用方传入，避免服务端渲染路径携带浏览器调试属性。
 */
function shouldSkipInstrumentation(id: string): boolean {
  if (id.startsWith('\0')) {
    return true
  }

  const normalized = normalizePath(id)

  if (normalized.includes('/node_modules/')) {
    return true
  }

  return !normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized)
}

/**
 * 统一路径分隔符。
 *
 * elementId 会被用户复制给 AI，跨平台场景下必须固定为 `/` 才便于解析。
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * 递归给模板元素注入源码 ID。
 *
 * Vue 编译器的位置信息已经是源码中的行列号，因此这里不重新计算 offset；
 * 对已有 `data-v-mcp-id` 的元素保持尊重，方便项目手动覆盖或测试固定 ID。
 */
function injectNodeId(
  s: MagicString,
  node: TemplateAstNode,
  relativeFile: string
): void {
  if (node.type !== ELEMENT_NODE_TYPE || !node.tag || !node.loc) {
    return
  }

  if (!SKIPPED_TAGS.has(node.tag) && !hasMcpIdAttr(node)) {
    const id = `${relativeFile}:${String(node.loc.start.line)}:${String(node.loc.start.column)}`
    const insertAt = node.loc.start.offset + node.tag.length + 1
    s.appendLeft(insertAt, ` ${MCP_ID_ATTR}="${id}"`)
  }

  for (const child of node.children ?? []) {
    injectNodeId(s, child, relativeFile)
  }
}

/**
 * 判断模板元素是否已经声明 MCP ID。
 *
 * 通过编译器 props 判断比字符串扫描更稳，避免被文本内容里的同名字符串误判。
 */
function hasMcpIdAttr(node: TemplateAstNode): boolean {
  return (node.props ?? []).some((prop) => {
    if (!isTemplateProp(prop)) {
      return false
    }

    return prop.name === MCP_ID_ATTR
  })
}

/**
 * 收窄 Vue 编译器 prop 节点。
 *
 * 这里故意只读取 `name`，不依赖完整内部类型，减少后续 Vue 编译器小版本变更的影响面。
 */
function isTemplateProp(value: unknown): value is { readonly name?: string } {
  return Boolean(value && typeof value === 'object' && 'name' in value)
}
