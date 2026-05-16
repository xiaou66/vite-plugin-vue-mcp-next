import { nanoid } from 'nanoid'
import { safeUrlPathname } from '../shared/url'

/**
 * 页面运行时身份输入。
 *
 * 测试中传入 window-like 对象可以避免直接依赖浏览器全局对象。
 */
export interface RuntimePageIdentityInput {
  /** 当前页面完整 URL，用于关联 runtime target 和 CDP target。 */
  readonly href: string
  /** 当前页面标题，用于多页面调试时辅助识别。 */
  readonly title: string
  /** 视口宽度，用于帮助 AI 判断页面当前布局状态。 */
  readonly innerWidth: number
  /** 视口高度，用于帮助 AI 判断页面当前布局状态。 */
  readonly innerHeight: number
  /** 文档加载状态，用于解释某些 DOM 或日志为何暂时不可用。 */
  readonly readyState: DocumentReadyState
}

/**
 * 页面运行时身份。
 *
 * Runtime Bridge 上报该结构后，服务端可以在没有 CDP 的情况下也维护可调试页面列表。
 */
export interface RuntimePageIdentity {
  /** runtime 页面唯一标识，同一路径多 tab 打开时仍可区分。 */
  readonly pageId: string
  /** 固定标记为 runtime，便于服务端区分 CDP target。 */
  readonly source: 'runtime'
  /** 当前页面完整 URL，用于展示和 target 关联。 */
  readonly url: string
  /** URL pathname，用于多入口页面的短路径展示。 */
  readonly pathname: string
  /** 页面标题，用于多页面调试时辅助识别。 */
  readonly title: string
  /** runtime 启动后页面默认处于可连接状态。 */
  readonly connected: true
  /** 文档加载状态，用于解释 DOM 快照时机。 */
  readonly readyState: DocumentReadyState
  /** 当前视口尺寸，用于帮助 AI 判断响应式布局状态。 */
  readonly viewport: {
    readonly width: number
    readonly height: number
  }
}

/**
 * 创建 runtime 页面 ID。
 *
 * 使用随机 ID 而不是 URL，是因为同一个页面可能在多个 tab 中同时打开。
 */
export function createRuntimePageId(): string {
  return `runtime-${nanoid()}`
}

/**
 * 读取页面身份信息。
 *
 * Runtime Bridge 启动后立即上报该信息，让 MCP 在没有 CDP 的情况下也能列出可调试页面。
 */
export function getRuntimePageIdentity(
  input: RuntimePageIdentityInput
): RuntimePageIdentity {
  return {
    pageId: createRuntimePageId(),
    source: 'runtime',
    url: input.href,
    pathname: safeUrlPathname(input.href),
    title: input.title,
    connected: true,
    readyState: input.readyState,
    viewport: {
      width: input.innerWidth,
      height: input.innerHeight
    }
  }
}
