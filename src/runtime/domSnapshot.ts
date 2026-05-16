import { truncateText } from '../shared/sanitize'
import type { DomOptions } from '../types'

/**
 * DOM 节点快照。
 *
 * MCP 不应该返回真实 DOM 节点对象，而应该返回可序列化结构，便于 AI 理解和传输。
 */
export interface DomNodeSnapshot {
  /** 节点标签名，文本节点使用 `#text`。 */
  readonly tag: string
  /** 节点属性，敏感字段会被脱敏。 */
  readonly attrs?: Record<string, string>
  /** 节点文本，按配置截断。 */
  readonly text?: string
  /** 子节点，受最大深度和最大节点数限制。 */
  readonly children?: DomNodeSnapshot[]
}

/**
 * selector 查询结果。
 *
 * 查询工具只返回定位所需的摘要信息，避免把完整节点对象暴露给 MCP 客户端。
 */
export interface DomElementQueryResult {
  /** 元素标签名，用于快速判断命中的节点类型。 */
  readonly tag: string
  /** 元素聚合文本，用于 AI 判断该节点是否是目标控件。 */
  readonly text: string
  /** 元素属性快照，敏感字段会被脱敏。 */
  readonly attrs: Record<string, string>
  /** 元素布局矩形，便于后续判断可见区域和点击位置。 */
  readonly rect: Record<string, number>
}

/**
 * 创建裁剪后的 DOM 快照。
 *
 * DOM 输出必须裁剪，因为 MCP 上下文有限，大页面直接返回会导致 AI 无法消费。
 */
export function createDomSnapshot(
  root: Element,
  options: Required<DomOptions>
): DomNodeSnapshot {
  let count = 0

  /**
   * 递归访问 DOM 节点。
   *
   * 将递归放在闭包内可以共享节点计数，确保 maxNodes 是整棵树的全局限制。
   */
  function visit(node: Node, depth: number): DomNodeSnapshot | null {
    if (count >= options.maxNodes || depth > options.maxDepth) {
      return null
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return createTextSnapshot(node, options, () => {
        count += 1
      })
    }

    if (!(node instanceof Element)) {
      return null
    }

    const tag = node.tagName.toLowerCase()

    if (['script', 'style', 'noscript'].includes(tag)) {
      return null
    }

    count += 1

    return createElementSnapshot(node, tag, (child) => visit(child, depth + 1))
  }

  return visit(root, 0) ?? { tag: root.tagName.toLowerCase() }
}

/**
 * 查询 DOM 元素摘要。
 *
 * selector 查询用于让 AI 快速定位关键元素，不需要返回整棵 DOM。
 */
export function queryDomElements(
  selector: string,
  limit: number
): DomElementQueryResult[] {
  return Array.from(document.querySelectorAll(selector))
    .slice(0, limit)
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      text: element.textContent.trim(),
      attrs: collectAttrs(element),
      rect: serializeRect(element.getBoundingClientRect())
    }))
}

/**
 * 创建文本节点快照。
 *
 * 空白文本在调试时通常是布局噪声，过滤它们可以让 AI 更专注于真实内容。
 */
function createTextSnapshot(
  node: Node,
  options: Required<DomOptions>,
  markVisited: () => void
): DomNodeSnapshot | null {
  const text = node.textContent?.trim()

  if (!text) {
    return null
  }

  markVisited()

  return { tag: '#text', text: truncateText(text, options.maxTextLength).text }
}

/**
 * 创建元素节点快照。
 *
 * 属性和子节点拆开处理，是为了后续可以单独扩展属性脱敏或节点过滤策略。
 */
function createElementSnapshot(
  node: Element,
  tag: string,
  visitChild: (child: Node) => DomNodeSnapshot | null
): DomNodeSnapshot {
  const attrs = collectAttrs(node)
  const children = Array.from(node.childNodes)
    .map((child) => visitChild(child))
    .filter((child): child is DomNodeSnapshot => Boolean(child))

  return {
    tag,
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(children.length ? { children } : {})
  }
}

/**
 * 收集元素属性并隐藏敏感值。
 *
 * 密码输入框的 value 不能泄露给 MCP 客户端，即使它只在本地开发环境使用。
 */
function collectAttrs(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {}

  for (const attr of Array.from(element.attributes)) {
    attrs[attr.name] = attr.value
  }

  if (element instanceof HTMLInputElement && element.type === 'password') {
    attrs.value = '[masked]'
  }

  return attrs
}

/**
 * 序列化 DOMRect。
 *
 * 浏览器返回的 DOMRect 不是普通 JSON 对象，显式挑选字段可以让 MCP 输出稳定且可测试。
 */
function serializeRect(rect: DOMRect): Record<string, number> {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left
  }
}
