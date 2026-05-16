import type { Hookable } from 'hookable'
import type { ViteDevServer } from 'vite'
import type { RingBuffer } from './shared/ringBuffer'

/**
 * 插件对外暴露的主配置入口。
 *
 * 这些选项会同时影响 Vite 注入、MCP 服务、CDP 连接和运行时采集策略，
 * 因此集中在一个顶层接口里，便于使用者在 `vite.config.ts` 中一次性理解调试边界。
 */
export interface VueMcpNextOptions {
  /** MCP 服务挂载路径，默认 `/__mcp`，用于避开业务路由并延续参考项目接入方式。 */
  readonly mcpPath?: string
  /** MCP 服务打印和 Cursor 配置中使用的 host，默认 `localhost` 以限制本机开发访问。 */
  readonly host?: string
  /** 是否在 Vite 启动日志中打印 MCP 地址，默认开启方便开发者复制到 MCP 客户端。 */
  readonly printUrl?: boolean
  /** 是否写入 Cursor MCP 配置；只在 `.cursor` 已存在时生效，避免擅自创建编辑器配置目录。 */
  readonly updateCursorMcpJson?: boolean | CursorMcpConfig
  /** 非 HTML 入口的运行时脚本注入点，用于兼容不直接使用 `index.html` 的项目。 */
  readonly appendTo?: string | RegExp
  /** 通用 DevTools 能力配置；Vue 专属能力不受该配置影响，始终走 Vue Runtime Bridge。 */
  readonly runtime?: RuntimeOptions
  /** CDP 连接配置；插件只连接已有端点，不负责启动浏览器进程。 */
  readonly cdp?: CdpOptions
  /** Network 采集配置；请求体、响应体和 header 可能敏感，因此独立配置采集边界。 */
  readonly network?: NetworkOptions
  /** DOM 输出限制；页面 DOM 可能巨大，必须默认裁剪以适配 MCP 上下文。 */
  readonly dom?: DomOptions
  /** Console 日志缓存限制；日志是持续增长数据源，必须防止内存无界增长。 */
  readonly console?: ConsoleOptions
}

/**
 * Cursor MCP 配置写入策略。
 *
 * 该配置只负责本地开发体验，不应强行修改未启用 Cursor 的项目。
 */
export interface CursorMcpConfig {
  /** 是否启用 Cursor 配置写入，适合团队项目显式关闭自动改配置。 */
  readonly enabled: boolean
  /** Cursor 展示的 MCP 服务名，用于同一项目存在多个 MCP 服务时避免冲突。 */
  readonly serverName?: string
}

/**
 * 通用 DevTools 能力的运行模式。
 *
 * 这里控制 DOM、Console、Evaluate 等浏览器通用能力的优先通道；
 * Vue 组件、Router、Pinia 始终走 Vue Runtime Bridge。
 */
export interface RuntimeOptions {
  /** `auto` 表示 CDP 可用时优先使用 CDP，否则回退到页面 Hook。 */
  readonly mode?: RuntimeMode
  /** 控制台执行是高风险能力，需要独立开关避免默认暴露任意脚本执行入口。 */
  readonly evaluate?: EvaluateOptions
}

/** 通用 DevTools 能力的数据源选择策略，用于在 CDP 和页面 Hook 之间明确边界。 */
export type RuntimeMode = 'auto' | 'cdp' | 'hook'

/**
 * 控制台脚本执行配置。
 *
 * 该能力可以读取和修改页面状态，因此默认关闭，必须由用户显式启用。
 */
export interface EvaluateOptions {
  /** 是否允许 MCP 客户端执行页面脚本，默认关闭以保护页面状态。 */
  readonly enabled?: boolean
  /** 单次脚本执行超时时间，用于避免长任务阻塞 MCP 响应。 */
  readonly timeoutMs?: number
}

/**
 * CDP 连接配置。
 *
 * 只连接用户提供的调试端点，可以避免跨平台 Chrome 启动和进程管理问题。
 */
export interface CdpOptions {
  /** Chrome remote debugging 的 HTTP 地址，用于自动发现 WebSocket target。 */
  readonly browserUrl?: string
  /** 已知 CDP WebSocket endpoint，适合由外部工具或宿主直接传入。 */
  readonly wsEndpoint?: string
  /** 页面 target 匹配规则，用于多页面或多 tab 场景下绑定正确调试目标。 */
  readonly targetUrlPattern?: string | RegExp
}

/**
 * Network 采集配置。
 *
 * Network 数据可能包含敏感参数和响应体，必须配置缓存、截断和脱敏策略。
 */
export interface NetworkOptions {
  /** `auto` 表示 CDP 可用时使用 CDP，否则回退到 fetch/XHR Hook。 */
  readonly mode?: NetworkMode
  /** 最大缓存条数，用于避免长时间开发会话无限占用内存。 */
  readonly maxRecords?: number
  /** 是否采集请求体，调试接口参数时有用，但可能包含敏感数据。 */
  readonly captureRequestBody?: boolean
  /** 是否采集响应体，调试接口返回值时有用，但必须配合 `maxBodySize` 截断。 */
  readonly captureResponseBody?: boolean
  /** 请求体和响应体的最大采集长度，避免大文件响应污染 MCP 上下文。 */
  readonly maxBodySize?: number
  /** 需要脱敏的 header 名称，默认覆盖认证和 Cookie 相关字段。 */
  readonly maskHeaders?: string[]
}

/** Network 采集通道选择策略，用于在 CDP、Hook 和关闭采集之间保持显式选择。 */
export type NetworkMode = 'auto' | 'cdp' | 'hook' | 'off'

/**
 * DOM 输出限制。
 *
 * DOM 树可能非常大，默认限制能保证 AI 获取结构信息而不是被大量无关节点淹没。
 */
export interface DomOptions {
  /** 最大 DOM 深度，适合控制复杂组件页面的递归输出成本。 */
  readonly maxDepth?: number
  /** 最大节点数量，防止一次调用返回整页巨量节点。 */
  readonly maxNodes?: number
  /** 单个文本节点最大长度，保留定位信息但避免长文本占满上下文。 */
  readonly maxTextLength?: number
}

/**
 * Console 日志缓存限制。
 *
 * 日志会持续增长，因此需要固定上限以保证开发服务器长时间运行仍可控。
 */
export interface ConsoleOptions {
  /** 最大日志条数，超过后按先进先出策略丢弃旧日志。 */
  readonly maxRecords?: number
}

/**
 * 解析后的插件配置。
 *
 * 内部模块只读取该类型，避免每个模块重复处理可选配置和默认值。
 */
export interface ResolvedVueMcpNextOptions {
  /** 已解析 MCP 路径，内部路由挂载只能使用该值。 */
  readonly mcpPath: string
  /** 已解析 host，用于日志输出和编辑器配置写入。 */
  readonly host: string
  /** 是否打印 MCP 地址，内部不再读取用户原始配置。 */
  readonly printUrl: boolean
  /** 已规范化 Cursor 配置，boolean 输入会在 mergeOptions 中转换成对象。 */
  readonly updateCursorMcpJson: Required<CursorMcpConfig>
  /** 非 HTML 入口注入点，未配置时 HTML 注入路径生效。 */
  readonly appendTo?: string | RegExp
  /** 已补齐默认值的通用 DevTools 配置。 */
  readonly runtime: Required<RuntimeOptions> & {
    readonly evaluate: Required<EvaluateOptions>
  }
  /** 已补齐默认值的 CDP 配置，字段可能为空但对象必须存在。 */
  readonly cdp: CdpOptions
  /** 已补齐默认值的 Network 配置。 */
  readonly network: Required<NetworkOptions>
  /** 已补齐默认值的 DOM 输出限制。 */
  readonly dom: Required<DomOptions>
  /** 已补齐默认值的 Console 缓存限制。 */
  readonly console: Required<ConsoleOptions>
}

/**
 * MCP 可选择的页面目标。
 *
 * 同一路径可能被多个浏览器 tab、iframe 或 CDP target 同时打开，
 * 因此页面选择不能只依赖 URL，必须使用稳定的 pageId。
 */
export interface PageTarget {
  /** 页面唯一标识，用于让 MCP 工具在多实例页面中稳定选择目标。 */
  readonly pageId: string
  /** 页面来源，用于解释该页面当前能使用 runtime 能力还是 CDP 能力。 */
  readonly source: 'runtime' | 'cdp'
  /** 当前页面 URL，用于展示和与 CDP target 做关联匹配。 */
  readonly url: string
  /** URL pathname，用于把 Vite 多入口页面以更短路径展示给用户。 */
  readonly pathname: string
  /** 页面标题，用于 AI 和用户在多个相似 URL 中识别目标页面。 */
  readonly title?: string
  /** 对应的 Vite HTML 入口或 appendTo 入口，用于说明页面来自哪个开发入口。 */
  readonly entry?: string
  /** 页面是否仍可调试，用于避免 MCP 对已断开的页面继续执行操作。 */
  readonly connected: boolean
}

/**
 * 页面 Console 和运行时异常的统一记录。
 *
 * CDP 与页面 Hook 返回的日志格式不同，统一结构可以让 MCP 工具不关心采集来源。
 */
export interface ConsoleRecord {
  /** 日志唯一标识，用于分页、清理或后续定位单条日志。 */
  readonly id: string
  /** 日志所属页面，避免多页面开发时把不同 tab 的输出混在一起。 */
  readonly pageId: string
  /** 日志来源，用于说明该记录来自 CDP 事件还是页面 Hook 缓存。 */
  readonly source: 'cdp' | 'hook'
  /** 日志级别，用于 MCP 工具按 error/warn 等常见调试维度过滤。 */
  readonly level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  /** 面向 AI 的主要文本内容，避免每次都解析复杂 args。 */
  readonly message: string
  /** 原始参数快照，用于需要还原对象日志时提供结构化信息。 */
  readonly args?: unknown[]
  /** 错误堆栈，用于定位运行时异常的来源文件和调用链。 */
  readonly stack?: string
  /** 记录时间戳，用于还原日志与网络请求、用户操作之间的先后关系。 */
  readonly timestamp: number
}

/**
 * 页面网络请求的统一记录。
 *
 * CDP 和 Hook 能采集到的字段不同，但 MCP 工具需要用同一种结构回答
 * “请求了什么、参数是什么、响应是什么”。
 */
export interface NetworkRecord {
  /** 请求唯一标识，用于从列表摘要进一步查询请求详情。 */
  readonly id: string
  /** 请求所属页面，避免多页面并行调试时网络记录互相污染。 */
  readonly pageId: string
  /** 采集来源，用于区分完整 CDP Network 数据和 fetch/XHR Hook 数据。 */
  readonly source: 'cdp' | 'hook'
  /** 请求 URL，用于回答“请求了哪个接口”并支持按 URL 过滤。 */
  readonly url: string
  /** HTTP 方法，用于区分 GET/POST 等接口语义。 */
  readonly method: string
  /** 请求头快照，调试鉴权、content-type 和代理问题时需要查看。 */
  readonly requestHeaders?: Record<string, string>
  /** URL query 参数，单独拆出是为了让 AI 不必从 URL 字符串中再次解析。 */
  readonly requestQuery?: Record<string, string | string[]>
  /** 请求体，调试提交参数时需要；采集时必须受脱敏和大小限制约束。 */
  readonly requestBody?: unknown
  /** 响应状态码，用于快速判断请求成功、失败或重定向。 */
  readonly status?: number
  /** 响应头快照，用于调试缓存、跨域和内容类型问题。 */
  readonly responseHeaders?: Record<string, string>
  /** 响应体，调试接口返回值时需要；过大时必须截断并标记。 */
  readonly responseBody?: unknown
  /** 请求失败原因，用于表达网络错误、取消、跨域失败等非正常响应。 */
  readonly error?: string
  /** 请求开始时间，用于按时间线还原页面行为。 */
  readonly startedAt: number
  /** 请求结束时间，用于和 startedAt 共同计算耗时。 */
  readonly endedAt?: number
  /** 请求耗时，直接提供给 AI 做慢请求判断，避免每次重复计算。 */
  readonly durationMs?: number
}

/**
 * 页面目标注册表。
 *
 * MCP 工具需要稳定选择目标页面，而同一路径可能被多个 tab 同时打开，
 * 因此这里使用 pageId 做主键，不使用 URL 做唯一标识。
 */
export interface PageTargetRegistry {
  /** 新增或更新页面目标，适合 runtime 重连和 CDP target 刷新场景。 */
  upsert(target: PageTarget): void
  /** 获取单个页面目标，工具调用解析 pageId 时使用。 */
  get(pageId: string): PageTarget | undefined
  /** 返回所有页面目标快照，避免调用方修改内部 Map。 */
  list(): PageTarget[]
  /** 标记页面断开，保留记录可以帮助用户理解刚才的页面为什么不可操作。 */
  disconnect(pageId: string): void
}

/**
 * 插件内部共享上下文。
 *
 * 所有 MCP 工具都通过该上下文访问页面、日志和网络缓存，避免不同工具维护各自状态。
 */
export interface VueMcpNextContext {
  /** 解析后的安全配置，所有内部模块只能读取该配置，不能再次直接读取用户原始配置。 */
  readonly options: ResolvedVueMcpNextOptions
  /** 当前 Vite 开发服务器实例，只有 serve 模式下 MCP 路由和 runtime 注入才需要它。 */
  readonly server?: ViteDevServer
  /** 跨 RPC 请求的事件总线，用于复用参考项目的事件回传模型。 */
  readonly hooks: Hookable
  /** Vue Runtime Bridge 的服务端 RPC 代理，Vue 专属工具通过它请求浏览器页面返回组件语义数据。 */
  rpcServer?: VueRuntimeRpc
  /** 页面目标注册表，负责多页面和 CDP target 的统一选择。 */
  readonly pages: PageTargetRegistry
  /** Console 日志缓存，给 MCP 日志工具提供最近的调试上下文。 */
  readonly consoleRecords: RingBuffer<ConsoleRecord>
  /** Network 请求缓存，给 MCP Network 工具提供摘要和详情。 */
  readonly networkRecords: RingBuffer<NetworkRecord>
  /** 可选 CDP 生命周期控制器，用于纯 CDP target 被发现后启动 Console 和 Network 监听。 */
  cdpLifecycle?: CdpLifecycleController
}

/**
 * CDP 生命周期控制器。
 *
 * Console 和 Network 需要持续监听，不能像 DOM/Evaluate 那样每次调用后立刻断开，
 * 因此控制器挂在上下文里，让页面发现工具也能为纯 CDP target 启动监听。
 */
export interface CdpLifecycleController {
  /** 页面连接或 CDP target 被发现后尝试启动对应 CDP 监听。 */
  connectPage(target: PageTarget): Promise<void>
  /** 关闭所有已建立的 CDP 连接，避免开发服务器退出后残留调试连接。 */
  closeAll(): Promise<void>
}

/**
 * 浏览器 Runtime Bridge 暴露给服务端的 Vue 调试 RPC。
 *
 * Vue 专属能力必须走运行时通道，因为 CDP 不理解组件、Router 和 Pinia 的应用层语义。
 */
export interface VueRuntimeRpc {
  /** 读取页面 DOM 快照，用于无 CDP 配置时提供 Hook fallback。 */
  getDomTree(options: {
    event: string
    maxDepth: number
    maxNodes: number
    maxTextLength: number
  }): void | Promise<void>
  /** 回传 DOM 快照，使用事件名隔离并发 MCP 请求。 */
  onDomTreeUpdated(event: string, data: unknown): void
  /** 按 selector 查询页面 DOM，用于无 CDP 配置时定位具体元素。 */
  queryDom(options: {
    event: string
    selector: string
    limit: number
  }): void | Promise<void>
  /** 回传 selector 查询结果。 */
  onDomQueryUpdated(event: string, data: unknown): void
  /** 执行已授权的页面表达式，用于无 CDP 配置时提供控制台测试能力。 */
  evaluateScript(options: {
    event: string
    expression: string
    awaitPromise?: boolean
    timeoutMs: number
  }): void | Promise<void>
  /** 回传页面表达式执行结果。 */
  onEvaluateScriptUpdated(event: string, data: unknown): void
  /** 读取 Vue component inspector tree，用于 `get_component_tree` 工具。 */
  getInspectorTree(options: {
    event: string
    componentName?: string
  }): void | Promise<void>
  /** 回传 component tree，使用事件名可以让并发 MCP 请求互不干扰。 */
  onInspectorTreeUpdated(event: string, data: unknown): void
  /** 读取指定组件状态，用于定位 props、setup、data 等 Vue 状态。 */
  getInspectorState(options: {
    event: string
    componentName: string
  }): void | Promise<void>
  /** 回传组件状态。 */
  onInspectorStateUpdated(event: string, data: unknown): void
  /** 修改组件状态，只用于开发态调试。 */
  editComponentState(options: {
    componentName: string
    path: string[]
    value: string
    valueType: string
  }): void | Promise<void>
  /** 高亮组件，帮助用户在页面中确认 AI 选择的组件。 */
  highlightComponent(options: { componentName: string }): void | Promise<void>
  /** 获取 Vue Router 信息。 */
  getRouterInfo(options: { event: string }): void
  /** 回传 Vue Router 信息。 */
  onRouterInfoUpdated(event: string, data: unknown): void
  /** 获取 Pinia store tree。 */
  getPiniaTree(options: { event: string }): void | Promise<void>
  /** 回传 Pinia store tree。 */
  onPiniaTreeUpdated(event: string, data: unknown): void
  /** 获取指定 Pinia store state。 */
  getPiniaState(options: {
    event: string
    storeName: string
  }): void | Promise<void>
  /** 回传 Pinia store state。 */
  onPiniaInfoUpdated(event: string, data: unknown): void
}
