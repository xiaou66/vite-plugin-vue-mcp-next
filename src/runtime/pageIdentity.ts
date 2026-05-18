/**
 * Runtime 页面身份生成。
 *
 * 该文件把页面级随机 pageId 和同标签页稳定 client id 分开维护，
 * 让 MCP 既能区分多标签页，又能在刷新重连时清理旧 runtime 目标。
 */
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
  /** 同标签页稳定身份，用于服务端清理刷新或 HMR 造成的旧 runtime 连接。 */
  readonly runtimeClientId: string
  /** 视口宽度，用于帮助 AI 判断页面当前布局状态。 */
  readonly innerWidth: number
  /** 视口高度，用于帮助 AI 判断页面当前布局状态。 */
  readonly innerHeight: number
  /** 文档加载状态，用于解释某些 DOM 或日志为何暂时不可用。 */
  readonly readyState: DocumentReadyState
}

/**
 * runtime client id 的最小存储接口。
 *
 * 只依赖 getItem/setItem，便于在测试中使用轻量对象，也避免把身份生成逻辑绑定到浏览器全局对象。
 */
export interface RuntimeClientIdStorage {
  /** 读取同标签页已保存的 client id。 */
  getItem(key: string): string | null
  /** 写入同标签页后续刷新可复用的 client id。 */
  setItem(key: string, value: string): void
}


/**
 * runtime client id 的标签页作用域。
 *
 * 浏览器新标签页可能复制 opener 的 sessionStorage 初始值，因此需要一个不会被复制的标签页标记辅助区分。
 */
export interface RuntimeClientIdTabScope {
  /** window.name 会跨刷新保留，适合作为开发态调试身份的轻量标签页标记。 */
  name: string
  /** 当前 JS 上下文内的 runtime client id，优先用于抵御 HMR 或重复启动。 */
  __VITE_MCP_NEXT_RUNTIME_CLIENT_ID__?: string
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
  /** 同标签页稳定身份，用于服务端把刷新后的新连接和旧 pageId 关联起来。 */
  readonly runtimeClientId: string
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

const RUNTIME_CLIENT_ID_STORAGE_KEY = 'vite-plugin-vue-mcp-next:runtime-client-id'
const RUNTIME_CLIENT_ID_WINDOW_NAME_PREFIX =
  'vite-plugin-vue-mcp-next:runtime-client-id='
const RUNTIME_CLIENT_ID_WINDOW_NAME_SEPARATOR = '\n'

/**
 * 创建同标签页稳定 client id。
 *
 * 该 ID 不作为 MCP 工具调用目标，只用于服务端识别同一个浏览器标签页刷新后的新连接。
 */
export function createRuntimeClientId(): string {
  return `runtime-client-${nanoid()}`
}

/**
 * 获取同标签页稳定 client id。
 *
 * 正常浏览器环境使用 sessionStorage 跨刷新复用；隐私模式或存储不可用时退回单次随机 ID，
 * 这样不会阻塞 runtime bridge 启动，只是无法自动合并该标签页的历史连接。
 */
/**
 * 从 window.name 中读取 runtime client id。
 *
 * 该标记用于识别同一个真实标签页，避免新标签页复制 sessionStorage 后被误判为同一页面。
 */
function readRuntimeClientIdFromTabScope(
  tabScope?: RuntimeClientIdTabScope
): string | undefined {
  if (!tabScope) {
    return undefined
  }

  if (tabScope.__VITE_MCP_NEXT_RUNTIME_CLIENT_ID__) {
    return tabScope.__VITE_MCP_NEXT_RUNTIME_CLIENT_ID__
  }

  return tabScope.name
    .split(RUNTIME_CLIENT_ID_WINDOW_NAME_SEPARATOR)
    .find((item) => item.startsWith(RUNTIME_CLIENT_ID_WINDOW_NAME_PREFIX))
    ?.slice(RUNTIME_CLIENT_ID_WINDOW_NAME_PREFIX.length)
}

/**
 * 写入 window.name 中的 runtime client id 标记。
 *
 * 保留已有 window.name 内容，是为了降低对业务页面或测试页面自身 window.name 用法的影响。
 */
function writeRuntimeClientIdToTabScope(
  tabScope: RuntimeClientIdTabScope,
  clientId: string
): void {
  tabScope.__VITE_MCP_NEXT_RUNTIME_CLIENT_ID__ = clientId
  const preservedNameParts = tabScope.name
    .split(RUNTIME_CLIENT_ID_WINDOW_NAME_SEPARATOR)
    .filter((item) => !item.startsWith(RUNTIME_CLIENT_ID_WINDOW_NAME_PREFIX))
    .filter(Boolean)
  tabScope.name = [
    ...preservedNameParts,
    `${RUNTIME_CLIENT_ID_WINDOW_NAME_PREFIX}${clientId}`
  ].join(RUNTIME_CLIENT_ID_WINDOW_NAME_SEPARATOR)
}

/**
 * 保存 runtime client id。
 *
 * sessionStorage 支撑刷新复用，window.name 标记支撑区分复制 sessionStorage 的新标签页。
 */
function persistRuntimeClientId(
  storage: RuntimeClientIdStorage,
  clientId: string,
  tabScope?: RuntimeClientIdTabScope
): string {
  storage.setItem(RUNTIME_CLIENT_ID_STORAGE_KEY, clientId)

  if (tabScope) {
    writeRuntimeClientIdToTabScope(tabScope, clientId)
  }

  return clientId
}

export function getRuntimeClientId(
  storage?: RuntimeClientIdStorage,
  tabScope?: RuntimeClientIdTabScope
): string {
  const nextClientId = createRuntimeClientId()

  if (!storage) {
    return nextClientId
  }

  try {
    const tabScopedClientId = readRuntimeClientIdFromTabScope(tabScope)

    if (tabScopedClientId) {
      return persistRuntimeClientId(storage, tabScopedClientId, tabScope)
    }

    if (tabScope) {
      return persistRuntimeClientId(storage, nextClientId, tabScope)
    }

    const currentClientId = storage.getItem(RUNTIME_CLIENT_ID_STORAGE_KEY)

    if (currentClientId) {
      return currentClientId
    }

    return persistRuntimeClientId(storage, nextClientId)
  } catch {
    return nextClientId
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
    runtimeClientId: input.runtimeClientId,
    connected: true,
    readyState: input.readyState,
    viewport: {
      width: input.innerWidth,
      height: input.innerHeight
    }
  }
}
