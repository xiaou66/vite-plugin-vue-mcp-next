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
  /** 是否写入 Cursor MCP 配置；默认只在 `.cursor` 已存在时写入，显式 `true` 会创建配置。 */
  readonly updateCursorMcpJson?: boolean | CursorMcpConfig
  /** 是否写入常见 AI 客户端的项目级 MCP 配置；默认按项目已有客户端入口自动探测。 */
  readonly mcpClients?: McpClientConfigOptions
  /** AI 使用指南自动安装配置，用于让 AI 客户端知道何时以及如何使用本 MCP。 */
  readonly skill?: SkillConfigOptions
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
  /** Screenshot 配置；CDP 真截图优先，runtime 降级使用 snapdom。 */
  readonly screenshot?: ScreenshotOptions
  /** 性能诊断配置；默认用轻量 Runtime 采样，配置 CDP 后可升级为 CPU Profile 与 Heap Snapshot。 */
  readonly performance?: PerformanceOptions
}

/**
 * Cursor MCP 配置写入策略。
 *
 * 该配置只负责本地开发体验，不应强行修改未启用 Cursor 的项目。
 */
export interface CursorMcpConfig {
  /** 是否启用 Cursor 配置写入；显式启用会创建 `.cursor/mcp.json`，显式关闭会跳过。 */
  readonly enabled: boolean
  /** Cursor 展示的 MCP 服务名，用于同一项目存在多个 MCP 服务时避免冲突。 */
  readonly serverName?: string
}

/**
 * MCP 客户端项目级配置写入策略。
 *
 * 多个 AI 客户端使用不同配置文件，但都指向同一个开发态 MCP 地址；
 * 集中配置可以避免为每个客户端暴露一组重复选项。
 */
export interface McpClientConfigOptions {
  /** 是否写入 Cursor 的 `.cursor/mcp.json`；默认只在 `.cursor` 目录已存在时自动写入。 */
  readonly cursor?: boolean
  /** 是否写入 Codex 的 `.codex/config.toml`；默认只在 `.codex` 目录已存在时自动写入。 */
  readonly codex?: boolean
  /** 是否写入 Claude Code 的 `.mcp.json`；默认只在根目录 `.mcp.json` 已存在时自动写入。 */
  readonly claudeCode?: boolean
  /** 是否写入 Trae 的 `.trae/mcp.json`；默认只在 `.trae` 目录已存在时自动写入。 */
  readonly trae?: boolean
  /** MCP 客户端中展示的服务名，同一项目存在多个 MCP 服务时用于避免冲突。 */
  readonly serverName?: string
}

/**
 * AI 使用指南自动安装配置。
 *
 * 该配置只影响项目级 skill/rule 文件写入，不影响 MCP 服务是否启动；
 * 独立开关可以让不希望插件修改 AI 客户端上下文的项目完全关闭自动安装。
 */
export interface SkillConfigOptions {
  /** 是否在 Vite dev server 启动时自动安装 AI 使用指南，默认开启。 */
  readonly autoConfig?: boolean
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
 * 性能诊断的运行模式。
 *
 * `off` 允许项目显式关闭性能采集，适合某些页面对调试采样非常敏感的场景。
 */
export type PerformanceMode = RuntimeMode | 'off'

/**
 * 性能内存采样配置。
 *
 * 该开关允许项目仅采集卡顿信息而不持续读取内存趋势，适合对浏览器兼容性要求较高的场景。
 */
export interface PerformanceMemoryOptions {
  /** 是否采集内存趋势，默认开启。 */
  readonly enabled?: boolean
}

/**
 * 性能堆栈采样配置。
 *
 * 该开关允许项目在 runtime-only 场景下关闭额外的错误堆栈收集，减少调试噪音。
 */
export interface PerformanceStackOptions {
  /** 是否采集可用堆栈信息，默认开启。 */
  readonly enabled?: boolean
}

/**
 * 性能诊断配置。
 *
 * 配置层只负责约束采集窗口、保存目录和采样粒度，具体报告结构由运行时和 CDP 采集器统一输出。
 */
export interface PerformanceOptions {
  /** 采集模式，`auto` 会优先使用 CDP，`hook` 只走 runtime，`cdp` 强制使用调试协议。 */
  readonly mode?: PerformanceMode
  /** 单次采集最长时长，避免长期占用性能采样资源。 */
  readonly maxDurationMs?: number
  /** 内存和事件循环延迟采样间隔，较短的间隔会增加少量采样开销。 */
  readonly sampleIntervalMs?: number
  /** 视为卡顿的任务阈值，默认 50ms。 */
  readonly longTaskThresholdMs?: number
  /** 原始 profile 和 heap 文件保存目录，默认保存在项目内 `.vite-mcp/performance`。 */
  readonly saveDir?: string
  /** 内存趋势采样开关。 */
  readonly memory?: PerformanceMemoryOptions
  /** 可用堆栈采样开关。 */
  readonly stacks?: PerformanceStackOptions
}

/**
 * 长任务记录。
 *
 * runtime 和 CDP 都会把自己的卡顿信号归一成同一结构，便于 MCP 工具解释“哪一段卡住了”。
 */
export interface LongTaskRecord {
  /** 长任务开始时间，和采集窗口同一时间基准。 */
  readonly startTime: number
  /** 长任务持续时间，通常要与阈值比较后再计算 blocked time。 */
  readonly durationMs: number
  /** 任务名称或来源信息，若可用则方便定位具体脚本。 */
  readonly name?: string
  /** 浏览器暴露的 attribution 元信息，runtime 路径可能为空。 */
  readonly attribution?: unknown[]
  /** 对应堆栈 id，供 CDP profile 或错误堆栈关联。 */
  readonly stackId?: string
  /** 数据来源，用于区分浏览器观察条目、事件循环延迟和 CPU Profile 采样。 */
  readonly source: 'longtask' | 'long-animation-frame' | 'cpu-profile' | 'event-loop-lag'
}

/**
 * 内存采样点。
 *
 * 只表达使用量趋势，不假装 runtime-only 路径能拿到完整 heap 结构。
 */
export interface MemorySample {
  /** 采样时间戳。 */
  readonly timestamp: number
  /** JS 堆已用大小。 */
  readonly usedJSHeapSize?: number
  /** JS 堆总大小。 */
  readonly totalJSHeapSize?: number
  /** JS 堆限制。 */
  readonly jsHeapSizeLimit?: number
  /** 同步采样得到的事件循环延迟。 */
  readonly eventLoopLagMs?: number
}

/**
 * 内存趋势摘要。
 *
 * 该结构不暴露对象引用链，只描述趋势是否持续增长。
 */
export interface MemorySummary {
  /** 采样序列。 */
  readonly samples: MemorySample[]
  /** 初始堆使用量。 */
  readonly initialUsedJSHeapSize?: number
  /** 结束堆使用量。 */
  readonly finalUsedJSHeapSize?: number
  /** 峰值堆使用量。 */
  readonly peakUsedJSHeapSize?: number
  /** 结束与开始之间的差值。 */
  readonly deltaUsedJSHeapSize?: number
  /** 趋势结论。 */
  readonly trend: 'stable' | 'growing' | 'unknown'
}

/**
 * 可定位的堆栈帧摘要。
 *
 * CDP profile 会更完整，runtime-only 路径则通常只能补充错误栈里的少量函数名。
 */
export interface StackFrameSummary {
  /** 函数名。 */
  readonly functionName: string
  /** 关联脚本 URL。 */
  readonly url?: string
  /** 行号。 */
  readonly lineNumber?: number
  /** 列号。 */
  readonly columnNumber?: number
  /** 自身耗时。 */
  readonly selfTimeMs?: number
  /** 总耗时。 */
  readonly totalTimeMs?: number
  /** 命中次数。 */
  readonly hitCount?: number
}

/**
 * 堆栈摘要。
 *
 * 原始 profile 可能过大，不适合直接放进 MCP 响应，因此这里同时保留文件路径和摘要帧列表。
 */
export interface StackSummary {
  /** 热点帧列表。 */
  readonly topFrames: StackFrameSummary[]
  /** 原始 profile 文件路径。 */
  readonly rawProfilePath?: string
  /** 路径缺失或仅有 runtime 栈时的限制说明。 */
  readonly limitation?: string
}

/**
 * 性能摘要。
 *
 * 该结构用于快速判断页面是否存在明显卡顿，不要求用户先看完整原始数据。
 */
export interface PerformanceSummary {
  /** 阻塞时间。 */
  readonly blockedTimeMs: number
  /** 长任务数量。 */
  readonly longTaskCount: number
  /** 最大任务耗时。 */
  readonly maxTaskDurationMs: number
  /** 平均任务耗时。 */
  readonly averageTaskDurationMs?: number
  /** 是否疑似卡顿。 */
  readonly suspectedJank: boolean
  /** 严重程度。 */
  readonly severity: 'ok' | 'warning' | 'critical'
}

/**
 * 性能报告。
 *
 * 该结构是 runtime 和 CDP 两条路径对外共同输出的最终结果，调用方只需要看 source 和 limitations 就能知道边界。
 */
export interface PerformanceReport {
  /** 录制会话 id。 */
  readonly recordingId: string
  /** 页面 id。 */
  readonly pageId: string
  /** 数据来源。 */
  readonly source: 'cdp' | 'hook'
  /** 开始时间。 */
  readonly startedAt: number
  /** 结束时间。 */
  readonly endedAt: number
  /** 持续时间。 */
  readonly durationMs: number
  /** 快速摘要。 */
  readonly summary: PerformanceSummary
  /** 长任务列表。 */
  readonly longTasks: LongTaskRecord[]
  /** 内存摘要。 */
  readonly memory?: MemorySummary
  /** 堆栈摘要。 */
  readonly stacks?: StackSummary
  /** 原始产物。 */
  readonly artifacts?: PerformanceArtifact[]
  /** 能力限制说明。 */
  readonly limitations: string[]
}

/**
 * 性能产物。
 *
 * CDP 的原始 profile 与 heap snapshot 可能很大，因此用路径型产物表达而不是把内容直接塞进响应。
 */
export interface PerformanceArtifact {
  /** 产物类型。 */
  readonly kind: 'cpu-profile' | 'heap-snapshot'
  /** 绝对路径。 */
  readonly path: string
  /** 相对项目根目录的路径。 */
  readonly relativePath: string
  /** 字节大小。 */
  readonly byteLength: number
  /** 产物来源，当前仅 CDP 会生成这类文件。 */
  readonly source: 'cdp'
}

/**
 * 活动中的性能录制会话。
 *
 * MCP 工具可以通过 recordingId 暂停和恢复同一条采集链路，避免多个采集彼此污染。
 */
export interface PerformanceSession {
  /** 会话 id。 */
  readonly recordingId: string
  /** 页面 id。 */
  readonly pageId: string
  /** 数据来源。 */
  readonly source: 'cdp' | 'hook'
  /** 开始时间。 */
  readonly startedAt: number
  /** 是否采集内存。 */
  readonly includeMemory: boolean
  /** 是否采集堆栈。 */
  readonly includeStacks: boolean
  /** 采集模式。 */
  readonly mode: PerformanceMode
}

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
 * 截图通道选择策略。
 *
 * 页面截图在有 CDP 时应该尽量返回真实浏览器像素；没有 CDP 的开发场景则允许降级到 runtime，
 * 因此这里显式暴露策略，避免调用方误以为所有截图来源都具备同等准确度。
 */
export type ScreenshotPrefer = 'auto' | 'cdp' | 'runtime'

/**
 * 截图目标范围。
 *
 * 视口、整页和元素截图的坐标来源不同，提前收敛枚举可以让 CDP 与 snapdom 两条通道共享同一套参数校验。
 */
export type ScreenshotTarget = 'viewport' | 'fullPage' | 'element'

/**
 * 截图输出格式。
 *
 * MCP 返回 base64 数据，格式会直接影响体积；限制为常见浏览器截图格式可以简化大小控制和文档说明。
 */
export type ScreenshotFormat = 'png' | 'jpeg' | 'webp'

/** 截图输出类型，项目级配置用于统一控制 MCP 返回路径还是直接返回图片数据。 */
export type ScreenshotOutputType = 'path' | 'base64'

/**
 * snapdom 插件路径对象。
 *
 * 插件函数必须在浏览器 runtime 里通过 Vite import 加载，不能从 Node 侧配置直接序列化过去；
 * 该对象用于描述要加载哪个模块、读取哪个导出，以及是否传入插件工厂参数。
 */
export interface SnapdomPluginImportObject {
  /** Vite import 路径，适用于 `/src/foo.ts`、`@/foo` 这类由 Vite 解析的源码路径。 */
  readonly path: string
  /** 非默认导出插件时使用，避免强制用户改造已有模块结构。 */
  readonly exportName?: string
  /** 插件工厂参数，只允许可序列化数据，适合遮罩选择器、水印文案等配置。 */
  readonly options?: unknown
}

/**
 * snapdom 插件导入声明。
 *
 * 字符串覆盖最常见的默认导出插件；对象形式用于已有模块使用命名导出或需要工厂参数的场景。
 */
export type SnapdomPluginImport = string | SnapdomPluginImportObject

/**
 * 可安全从 Node 配置传到浏览器 runtime 的 snapdom options。
 *
 * snapdom 原生 options 包含函数型字段；这里仅接收 JSON-safe 部分，函数型能力统一通过 Vite import 路径加载。
 */
export interface JsonSafeSnapdomOptions {
  /** DOM 截图缩放倍率，适合在清晰度和 MCP 响应体积之间取舍。 */
  readonly scale?: number
  /** 设备像素比覆盖值，适合需要模拟高分屏截图的场景。 */
  readonly dpr?: number
  /** 输出宽度覆盖值，适合固定截图尺寸的自动化对比场景。 */
  readonly width?: number
  /** 输出高度覆盖值，适合固定截图尺寸的自动化对比场景。 */
  readonly height?: number
  /** 背景色兜底，适合页面自身透明但截图需要稳定底色的场景。 */
  readonly backgroundColor?: string
  /** 有损格式质量，适合控制 jpeg/webp 体积。 */
  readonly quality?: number
  /** snapdom 资源缓存策略，适合重复截图时减少资源重取成本。 */
  readonly cache?: boolean | 'soft' | 'disabled'
  /** 是否嵌入字体，适合需要尽量还原文本视觉的截图场景。 */
  readonly embedFonts?: boolean
  /** 是否使用本地字体，适合开发环境字体已安装且希望减少截图资源体积的场景。 */
  readonly localFonts?: boolean
  /** 跨域资源代理地址，适合图片或字体没有 CORS 但仍希望尽量渲染的场景。 */
  readonly useProxy?: string
  /** 排除选择器，适合隐藏 token、密码、调试浮层等不应进入截图的元素。 */
  readonly exclude?: string[]
}

/**
 * snapdom 降级截图配置。
 *
 * 该配置把可序列化 options 和函数型扩展分开，适用于 Vite 插件 Node 配置需要驱动浏览器 runtime 的场景。
 */
export interface SnapdomScreenshotOptions {
  /** 直接透传给 snapdom 的 JSON-safe options。 */
  readonly options?: JsonSafeSnapdomOptions
  /** 通过 Vite import 路径加载的插件列表，避免跨 runtime 传函数。 */
  readonly plugins?: SnapdomPluginImport[]
  /** 函数型 filter 的 Vite import 路径，适合复杂元素过滤逻辑。 */
  readonly filter?: string
  /** 函数型 fallbackURL 的 Vite import 路径，适合按资源 URL 定制兜底图。 */
  readonly fallbackURL?: string
}

/**
 * 页面截图配置。
 *
 * 截图能力同时存在真截图和 DOM 降级截图；集中配置可以让用户明确选择准确度、体积和兼容性边界。
 */
export interface ScreenshotOptions {
  /** 截图输出类型，项目级 MCP 默认用路径减少 base64 对上下文的占用。 */
  readonly type?: ScreenshotOutputType
  /** 截图保存目录，相对路径按 Vite 项目根目录解析。 */
  readonly saveDir?: string
  /** 默认截图通道选择，适合项目按运行环境统一控制降级策略。 */
  readonly prefer?: ScreenshotPrefer
  /** 单次 MCP 返回图片最大字节数，避免 base64 图片挤占上下文或拖慢客户端。 */
  readonly maxBytes?: number
  /** 无 CDP 时的 snapdom 降级配置。 */
  readonly snapdom?: SnapdomScreenshotOptions
}

/**
 * Runtime 截图请求。
 *
 * MCP 服务端无法直接执行浏览器 DOM 截图，必须通过 Vite RPC 把可序列化配置交给页面 runtime。
 */
export interface RuntimeScreenshotRequest {
  /** 并发请求隔离事件名，适用于多个 MCP 调用同时等待浏览器回传。 */
  readonly event: string
  /** 截图目标范围，runtime 侧据此选择 document 或 selector 元素。 */
  readonly target: ScreenshotTarget
  /** 元素截图选择器，只在 `target: "element"` 时需要。 */
  readonly selector?: string
  /** 输出格式，决定 snapdom 生成 Blob 的 mime type。 */
  readonly format: ScreenshotFormat
  /** 有损格式质量，适用于控制 jpeg/webp 体积。 */
  readonly quality?: number
  /** 单次调用缩放倍率覆盖值，适合临时获取高清局部截图。 */
  readonly scale?: number
  /** 已解析 snapdom 配置，函数型扩展仍以 Vite import 路径表达。 */
  readonly snapdom: Required<
    Pick<SnapdomScreenshotOptions, 'options' | 'plugins'>
  > &
    Omit<SnapdomScreenshotOptions, 'options' | 'plugins'>
}

/**
 * Runtime 截图结果。
 *
 * snapdom 是降级截图路径，结果必须带上限制说明，避免调用方误判为浏览器真实像素。
 */
export interface RuntimeScreenshotResult {
  /** 是否成功，保持与现有 runtime fallback 错误结构一致。 */
  readonly ok: boolean
  /** 图片 base64 数据，不包含 data URL 前缀，适合 MCP 结构化返回。 */
  readonly data?: string
  /** 截图宽度，帮助客户端理解图片尺寸和压缩取舍。 */
  readonly width?: number
  /** 截图高度，帮助客户端理解图片尺寸和压缩取舍。 */
  readonly height?: number
  /** 图片 mime type，用于 MCP 客户端正确解码。 */
  readonly mimeType?: string
  /** 原始 Blob 字节数，用于服务端执行 maxBytes 保护。 */
  readonly byteLength?: number
  /** DOM 截图已知限制，适合在 AI 回答中解释截图不完整原因。 */
  readonly limitations?: string[]
  /** 失败原因，保持浏览器 runtime 错误可读。 */
  readonly error?: string
}

/**
 * 浏览器存储资源范围。
 *
 * Cookie 在 Runtime 侧只能访问当前页面可见的非 HttpOnly 值；CDP 可补足浏览器级查询能力。
 */
export type StorageScope = 'localStorage' | 'sessionStorage' | 'indexedDB' | 'cookie'

/**
 * 浏览器存储操作类型。
 *
 * 使用统一动作枚举可以让 MCP 工具层和 Runtime 桥接层共享同一套权限与错误边界。
 */
export type StorageAction = 'list' | 'get' | 'set' | 'delete' | 'clear'

/**
 * Runtime 存储桥接请求。
 *
 * Runtime 侧遵守浏览器同源策略，能处理 Web Storage、IndexedDB 以及 document.cookie 可见 Cookie；
 * HttpOnly Cookie 必须依赖 CDP，不能通过页面脚本读取或删除。
 */
export interface RuntimeStorageRequest {
  /** 并发请求隔离事件名，沿用现有 Runtime RPC 回传模型。 */
  readonly event: string
  /** 页面目标 ID，用于多页面场景下确认请求来源。 */
  readonly pageId: string
  /** 当前页面 origin，Runtime 侧用它拒绝跨源误用。 */
  readonly origin: string
  /** 当前存储操作。 */
  readonly action: StorageAction
  /** 当前存储资源范围。 */
  readonly scope: StorageScope
  /** Web Storage key 或 IndexedDB key 的字符串表达。 */
  readonly key?: string
  /** 写入值的 JSON 字符串表达，Runtime 侧按资源类型解释。 */
  readonly value?: string
  /** IndexedDB 数据库名。 */
  readonly databaseName?: string
  /** IndexedDB object store 名称。 */
  readonly objectStoreName?: string
  /** IndexedDB index 名称，首版只作为查询边界保留。 */
  readonly indexName?: string
  /** Cookie 操作参数，Runtime 只使用 document.cookie 可表达的同源字段。 */
  readonly cookie?: {
    readonly name: string
    readonly value?: string
    readonly domain?: string
    readonly path?: string
    readonly url?: string
    readonly httpOnly?: boolean
    readonly secure?: boolean
    readonly sameSite?: 'strict' | 'lax' | 'none'
    readonly expires?: number
  }
}

/**
 * Runtime 存储桥接结果。
 *
 * 结果显式携带 source，避免调用方把页面同源能力误认为浏览器级 CDP 能力。
 */
export interface RuntimeStorageResult {
  /** 是否成功，失败时 error 必须说明边界或底层异常。 */
  readonly ok: boolean
  /** 存储访问来源，调用方可据此区分页面同源能力和浏览器协议能力。 */
  readonly source: 'hook' | 'cdp'
  /** 实际执行的操作类型。 */
  readonly action: StorageAction
  /** 实际访问的存储资源范围。 */
  readonly scope: StorageScope
  /** 成功时返回的结构化数据。 */
  readonly data?: unknown
  /** 能力限制说明，例如 Cookie 仅 CDP 可用。 */
  readonly limitations?: string[]
  /** 失败原因。 */
  readonly error?: string
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
  /** 已规范化的多客户端 MCP 配置写入策略，内部写入器只读取该对象。 */
  readonly mcpClients: Required<McpClientConfigOptions>
  /** 已补齐默认值的 AI 使用指南自动安装配置。 */
  readonly skill: Required<SkillConfigOptions>
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
  /** 已补齐默认值的截图配置。 */
  readonly screenshot: Required<Omit<ScreenshotOptions, 'snapdom'>> & {
    readonly snapdom: Required<
      Pick<SnapdomScreenshotOptions, 'options' | 'plugins'>
    > &
      Omit<SnapdomScreenshotOptions, 'options' | 'plugins'>
  }
  /** 已补齐默认值的性能配置。 */
  readonly performance: Required<Omit<PerformanceOptions, 'memory' | 'stacks'>> & {
    readonly memory: Required<PerformanceMemoryOptions>
    readonly stacks: Required<PerformanceStackOptions>
  }
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
  /** 同标签页稳定身份，仅 runtime 目标提供，用于刷新或 HMR 重连时断开旧 pageId。 */
  readonly runtimeClientId?: string
  /** 对应的 Vite HTML 入口或 appendTo 入口，用于说明页面来自哪个开发入口。 */
  readonly entry?: string
  /** 页面是否仍可调试，用于避免 MCP 对已断开的页面继续执行操作。 */
  readonly connected: boolean
  /** runtime 目标断开时间，仅用于保留短期历史并清理过期断开记录。 */
  readonly disconnectedAt?: number
}

/**
 * 页面目标列表选项。
 *
 * 默认列表面向日常调试，只展示可操作页面；排查生命周期问题时可显式包含断开 runtime 记录。
 */
export interface PageTargetListOptions {
  /** 是否包含已断开的 runtime 页面，默认隐藏以避免刷新历史干扰目标选择。 */
  readonly includeDisconnected?: boolean
  /** 测试或批处理场景可传入固定时间，避免依赖真实时钟造成用例不稳定。 */
  readonly now?: number
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
  upsert(target: PageTarget, now?: number): void
  /** 获取单个页面目标，工具调用解析 pageId 时使用。 */
  get(pageId: string): PageTarget | undefined
  /** 返回页面目标快照，默认隐藏已断开的 runtime 历史记录。 */
  list(options?: PageTargetListOptions): PageTarget[]
  /** 标记页面断开，保留短期记录可以帮助用户理解刚才的页面为什么不可操作。 */
  disconnect(pageId: string, now?: number): void
}

/**
 * 插件内部共享上下文。
 *
 * 所有 MCP 工具都通过该上下文访问页面、日志和网络缓存，避免不同工具维护各自状态。
 */
export interface VueMcpNextContext {
  /** 解析后的安全配置，所有内部模块只能读取该配置，不能再次直接读取用户原始配置。 */
  readonly options: ResolvedVueMcpNextOptions
  /** 当前 Vite 开发服务器实例，configureServer 阶段自动写入，供需要项目根目录的服务端工具复用。 */
  server?: ViteDevServer
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
  /** 性能报告缓存，给 get_performance_report 和最近会话查询使用。 */
  readonly performanceReports: RingBuffer<PerformanceReport>
  /** 活动中的性能录制会话，防止 start/stop 并发冲突。 */
  readonly performanceSessions: Map<string, PerformanceSession>
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
  /** 触发页面刷新，用于测试前消除上一轮运行状态对页面初始化的影响。 */
  reloadPage(options: { event: string }): void | Promise<void>
  /** 回传页面刷新触发结果；Runtime 路径只能普通刷新，不能承诺绕过 HTTP 缓存。 */
  onPageReloaded(event: string, data: unknown): void
  /** 执行已授权的页面表达式，用于无 CDP 配置时提供控制台测试能力。 */
  evaluateScript(options: {
    event: string
    expression: string
    awaitPromise?: boolean
    timeoutMs: number
  }): void | Promise<void>
  /** 回传页面表达式执行结果。 */
  onEvaluateScriptUpdated(event: string, data: unknown): void
  /** 通过 snapdom 执行浏览器端 DOM 截图，用于无 CDP 时提供截图降级能力。 */
  takeScreenshot(options: RuntimeScreenshotRequest): void | Promise<void>
  /** 回传 snapdom 截图结果，使用事件名隔离并发 MCP 请求。 */
  onScreenshotTaken(event: string, data: RuntimeScreenshotResult): void
  /** 访问同源浏览器存储，用于无 CDP 配置时提供 Web Storage 和 IndexedDB 兜底。 */
  manageStorage(options: RuntimeStorageRequest): void | Promise<void>
  /** 回传 Runtime 存储访问结果，使用事件名隔离并发 MCP 请求。 */
  onStorageUpdated(event: string, data: RuntimeStorageResult): void
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
  /** 进行一次性能诊断采样。 */
  recordPerformance(options: {
    event: string
    durationMs: number
    includeMemory: boolean
    includeStacks: boolean
  }): void | Promise<void>
  /** 回传一次性性能采样结果。 */
  onPerformanceRecorded(event: string, data: unknown): void
  /** 启动一段交互式性能录制。 */
  startPerformanceRecording(options: {
    event: string
    includeMemory: boolean
    includeStacks: boolean
  }): void | Promise<void>
  /** 回传录制启动结果。 */
  onPerformanceRecordingStarted(event: string, data: unknown): void
  /** 停止交互式性能录制。 */
  stopPerformanceRecording(options: {
    event: string
    recordingId: string
  }): void | Promise<void>
  /** 回传录制结束结果。 */
  onPerformanceRecordingStopped(event: string, data: unknown): void
}
