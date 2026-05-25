/**
 * 页面元素选择器。
 *
 * 该模块负责本地开发态的按键选择、hover 高亮、点击复制和轻提示；
 * 它不直接调用 MCP，确保用户确认后再把 elementId 发送给 AI。
 */

import type { ElementPickerShortcut } from '../types'
import { runtimeElementRegistry } from './elementRegistry'
import type { RuntimeElementRegistry } from './elementRegistry'

const MCP_ID_ATTR = 'data-v-mcp-id'
const INTERNAL_ATTR = 'data-v-mcp-internal'
const SUCCESS_MESSAGE = '元素位置已复制，请发送给 AI'
const COPY_FAILED_PREFIX = '复制失败，请手动复制元素 ID'
const OVERLAY_Z_INDEX = '2147483647'
const TOAST_Z_INDEX = '2147483647'

/**
 * 安装页面元素选择器。
 *
 * 选择器只在本地开发态响应快捷键，默认不改变页面交互；
 * 进入选择态后才拦截 hover 和 click，避免影响业务页面日常使用。
 */
export function installElementPicker(options: {
  readonly enabled: boolean
  readonly shortcut: Required<ElementPickerShortcut>
  readonly toastDurationMs: number
}): void {
  if (!options.enabled) {
    return
  }

  const registry = runtimeElementRegistry
  const overlay = createOverlay()
  let active = false
  let currentElement: Element | undefined

  window.addEventListener('keydown', (event) => {
    active = matchesShortcut(event, options.shortcut)
  })
  window.addEventListener('keyup', () => {
    active = false
    currentElement = undefined
    updateOverlay(overlay)
  })
  window.addEventListener('mousemove', (event) => {
    if (!active) {
      return
    }

    currentElement = document.elementFromPoint(event.clientX, event.clientY)
      ?? undefined
    updateOverlay(overlay, currentElement)
  })
  window.addEventListener(
    'click',
    (event) => {
      if (!active || !isElementLike(event.target)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      void copyAndNotify(event.target, registry, options.toastDurationMs)
    },
    true
  )
}

/**
 * 判断当前按键事件是否进入选择模式。
 *
 * 使用布尔等值比较而不是只判断 truthy，避免用户按下额外修饰键时误触。
 */
function matchesShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'shiftKey' | 'metaKey' | 'ctrlKey'>,
  shortcut: Required<ElementPickerShortcut>
): boolean {
  return (
    event.altKey === shortcut.altKey &&
    event.shiftKey === shortcut.shiftKey &&
    event.metaKey === shortcut.metaKey &&
    event.ctrlKey === shortcut.ctrlKey
  )
}

/**
 * 解析元素 ID。
 *
 * 编译期 ID 优先，因为它能直接定位源码；无 ID 的动态 DOM 才登记为 runtime fallback。
 */
function resolveElementId(
  element: Element,
  registry: RuntimeElementRegistry
): string {
  return element.getAttribute(MCP_ID_ATTR) ?? registry.register(element)
}

/**
 * 复制并提示元素 ID。
 *
 * click 监听器需要保持同步返回，异步复制流程单独封装以满足浏览器事件和 lint 约束。
 */
async function copyAndNotify(
  element: Element,
  registry: RuntimeElementRegistry,
  toastDurationMs: number
): Promise<void> {
  const elementId = resolveElementId(element, registry)
  const copied = await copyElementId(elementId)

  showToast(
    copied ? SUCCESS_MESSAGE : `${COPY_FAILED_PREFIX}: ${elementId}`,
    toastDurationMs
  )
}

/**
 * 复制元素 ID。
 *
 * Clipboard API 可能被浏览器权限或非安全上下文拒绝，失败时由轻提示暴露手动复制值。
 */
async function copyElementId(elementId: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(elementId)
    return true
  } catch {
    return false
  }
}

/**
 * 创建 hover 高亮层。
 *
 * 高亮层标记为内部元素，后续 DOM snapshot 会跳过它，避免 AI 误改调试 UI。
 */
function createOverlay(): HTMLElement {
  const overlay = document.createElement('div')
  markInternalElement(overlay)
  Object.assign(overlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    border: '2px solid #1d4ed8',
    background: 'rgba(29, 78, 216, 0.08)',
    zIndex: OVERLAY_Z_INDEX,
    display: 'none'
  })
  document.body.appendChild(overlay)
  return overlay
}

/**
 * 更新 hover 高亮层。
 *
 * 没有目标元素时隐藏 overlay；只读取布局矩形，不修改业务元素样式。
 */
function updateOverlay(overlay: HTMLElement, element?: Element): void {
  if (!element || getElementAttr(element, INTERNAL_ATTR) === 'true') {
    overlay.style.display = 'none'
    return
  }

  const rect = element.getBoundingClientRect()
  Object.assign(overlay.style, {
    display: 'block',
    left: `${String(rect.x)}px`,
    top: `${String(rect.y)}px`,
    width: `${String(rect.width)}px`,
    height: `${String(rect.height)}px`
  })
}

/**
 * 展示复制结果轻提示。
 *
 * 提示元素同样标记为内部元素，避免 DOM 查询和截图上下文把它当业务内容。
 */
function showToast(message: string, durationMs: number): void {
  const toast = document.createElement('div')
  markInternalElement(toast)
  toast.textContent = message
  Object.assign(toast.style, {
    position: 'fixed',
    left: '50%',
    bottom: '32px',
    transform: 'translateX(-50%)',
    zIndex: TOAST_Z_INDEX,
    padding: '8px 12px',
    borderRadius: '6px',
    background: 'rgba(17, 24, 39, 0.92)',
    color: '#fff',
    fontSize: '13px',
    pointerEvents: 'none'
  })
  document.body.appendChild(toast)
  globalThis.setTimeout(() => {
    toast.remove()
  }, durationMs)
}

/**
 * 收窄事件目标。
 *
 * 测试环境可能没有完整 DOM 构造函数，因此这里用能力检测保证 Node/Vitest 可测。
 */
function isElementLike(value: EventTarget | null): value is Element {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'getAttribute' in value &&
      'getBoundingClientRect' in value
  )
}

/**
 * 标记调试 UI 元素。
 *
 * 真实浏览器使用属性，测试假 DOM 可能只有 dataset；两者都写入可以让快照过滤逻辑保持一致。
 */
function markInternalElement(element: HTMLElement): void {
  if (typeof element.setAttribute === 'function') {
    element.setAttribute(INTERNAL_ATTR, 'true')
  }

  element.dataset.vMcpInternal = 'true'
}

/**
 * 读取元素属性。
 *
 * 对测试假 DOM 做保护，避免选择器交互测试必须模拟完整 HTMLElement。
 */
function getElementAttr(element: Element, name: string): string | null {
  if (typeof element.getAttribute === 'function') {
    return element.getAttribute(name)
  }

  return null
}
