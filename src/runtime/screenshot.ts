/**
 * 浏览器端 snapdom 截图降级能力。
 *
 * 该文件只在页面 runtime 中执行，适用于没有 CDP 但仍希望让 MCP 客户端看到页面视觉结果的场景；
 * 函数型扩展通过 Vite import 路径加载，避免 Node 侧配置直接跨运行时传递函数。
 */
import type {
  RuntimeScreenshotResult,
  ScreenshotFormat,
  ScreenshotTarget,
  SnapdomPluginImport,
  SnapdomScreenshotOptions
} from '../types'

/**
 * Runtime 截图参数。
 *
 * loader 只用于测试替换和 Vite 动态 import 边界；正常业务调用只需要传截图目标和 snapdom 配置。
 */
export interface RuntimeScreenshotOptions {
  /** 截图目标范围，用于选择 documentElement 或 selector 元素。 */
  readonly target: ScreenshotTarget
  /** 元素截图选择器，只在 `target: "element"` 时使用。 */
  readonly selector?: string
  /** 输出格式，决定 Blob mime type 和压缩策略。 */
  readonly format: ScreenshotFormat
  /** 有损格式质量，适用于 jpeg/webp 控制响应体积。 */
  readonly quality?: number
  /** 单次调用缩放倍率覆盖值，适合临时请求高清局部截图。 */
  readonly scale?: number
  /** 已解析 snapdom 配置，函数型配置仍以 Vite import 路径表达。 */
  readonly snapdom: Required<
    Pick<SnapdomScreenshotOptions, 'options' | 'plugins'>
  > &
    Omit<SnapdomScreenshotOptions, 'options' | 'plugins'>
  /** 测试或特殊运行环境替换 snapdom 加载方式时使用。 */
  readonly loadSnapdom?: () => Promise<{ snapdom: SnapdomFunction }>
  /** 测试或特殊运行环境替换 Vite 动态 import 时使用。 */
  readonly loadModule?: (path: string) => Promise<Record<string, unknown>>
}

/**
 * snapdom 函数边界。
 *
 * 只声明当前截图流程需要的最小能力，可以让本插件不绑定 snapdom 的完整内部类型。
 */
type SnapdomFunction = (
  element: Element,
  options: Record<string, unknown>
) => Promise<{ toBlob: (options?: Record<string, unknown>) => Promise<Blob> }>

/**
 * snapdom 加载器。
 *
 * 该函数由 Vite 虚拟模块注册，避免发布包 runtime 直接 import optional peer 后触发 optimizeDeps 失败。
 */
type SnapdomLoader = () => Promise<{ snapdom: SnapdomFunction }>

/**
 * 默认 snapdom 加载器。
 *
 * 缺失 optional peer 时返回结构化错误，适合 MCP 工具把原因直接反馈给大模型。
 */
let snapdomLoader: SnapdomLoader = () =>
  Promise.reject(createMissingSnapdomError())

/**
 * snapdom 扩展模块注册表。
 *
 * 注册表由 Vite 注入的虚拟 runtime wrapper 写入，而不是在发布的 runtime client 里直接 import 虚拟模块；
 * 这样可以避开 Vite optimizeDeps 扫描 node_modules 时无法解析虚拟模块的问题。
 */
let screenshotModuleRegistry: Partial<Record<string, Record<string, unknown>>> =
  {}

/**
 * 注册截图扩展模块。
 *
 * Vite import 路径必须在宿主项目的 Vite 模块图里解析，适用于插件、filter、fallbackURL 需要使用 alias 或源码转换的场景。
 */
export function setScreenshotModuleRegistry(
  registry: Record<string, Record<string, unknown>>
): void {
  screenshotModuleRegistry = registry
}

/**
 * 注册 snapdom 加载器。
 *
 * 只有宿主 Vite 项目可以正确解析 optional peer，因此由虚拟 runtime 入口在浏览器侧注册。
 */
export function setSnapdomLoader(loader: SnapdomLoader): void {
  snapdomLoader = loader
}

/**
 * 执行 runtime DOM 截图。
 *
 * snapdom 截图是 CDP 不可用时的兼容路径，因此返回结果必须带 `source: "snapdom"` 和限制说明。
 */
export async function takeRuntimeScreenshot(
  options: RuntimeScreenshotOptions
): Promise<RuntimeScreenshotResult & { source?: 'snapdom' }> {
  const target = resolveScreenshotTarget(options.target, options.selector)

  if (!target.ok) {
    return target
  }

  const loadSnapdom = options.loadSnapdom ?? loadDefaultSnapdom
  let loaded: { snapdom: SnapdomFunction }

  try {
    loaded = await loadSnapdom()
  } catch (error) {
    return {
      ok: false,
      source: 'snapdom',
      error: error instanceof Error ? error.message : String(error)
    }
  }

  const { snapdom } = loaded
  const snapdomOptions = await createSnapdomOptions(options)
  const capture = await snapdom(target.element, snapdomOptions)
  const blob = await capture.toBlob({
    type: createMimeType(options.format),
    quality: options.quality
  })
  const data = await blobToBase64(blob)
  const rect = target.element.getBoundingClientRect()

  return {
    ok: true,
    source: 'snapdom',
    data,
    width: rect.width,
    height: rect.height,
    mimeType: createMimeType(options.format),
    byteLength: blob.size,
    limitations: [
      'snapdom renders DOM to an image and may differ from browser pixels',
      'cross-origin images, iframe content, video, WebGL, and complex CSS may be incomplete'
    ]
  }
}

/**
 * 加载默认 snapdom 实现。
 *
 * 真实加载逻辑由宿主 Vite 虚拟模块注册，适合 optional peer 缺失时把错误留到 MCP 工具响应阶段。
 */
function loadDefaultSnapdom(): Promise<{ snapdom: SnapdomFunction }> {
  return snapdomLoader()
}

/**
 * 解析截图目标元素。
 *
 * runtime 降级截图只能读取页面自身 DOM；在边界处返回明确错误可以让 MCP 工具解释失败原因。
 */
function resolveScreenshotTarget(
  target: ScreenshotTarget,
  selector?: string
):
  | { ok: true; element: Element }
  | { ok: false; error: string } {
  if (target === 'element' && !selector) {
    return { ok: false, error: 'selector is required when target is element' }
  }

  if (target === 'element') {
    if (!selector) {
      return { ok: false, error: 'selector is required when target is element' }
    }

    const elementSelector = selector
    const element = document.querySelector(elementSelector)

    return element
      ? { ok: true, element }
      : { ok: false, error: `element not found: ${elementSelector}` }
  }

  return { ok: true, element: document.documentElement }
}

/**
 * 组装 snapdom options。
 *
 * 项目级配置和单次调用配置需要在浏览器端合并，因为插件、filter、fallbackURL 都依赖 Vite import。
 */
async function createSnapdomOptions(
  options: RuntimeScreenshotOptions
): Promise<Record<string, unknown>> {
  const snapdomOptions: Record<string, unknown> = {
    ...options.snapdom.options,
    quality: options.quality ?? options.snapdom.options.quality,
    scale: options.scale ?? options.snapdom.options.scale,
    plugins: await loadSnapdomPlugins(options)
  }
  const loadModule = createModuleLoader(options)

  if (options.snapdom.filter) {
    snapdomOptions.filter = await loadDefaultExport(
      loadModule,
      options.snapdom.filter
    )
  }

  if (options.snapdom.fallbackURL) {
    snapdomOptions.fallbackURL = await loadDefaultExport(
      loadModule,
      options.snapdom.fallbackURL
    )
  }

  return removeUndefinedEntries(snapdomOptions)
}

/**
 * 加载 snapdom 插件。
 *
 * 插件只能通过 Vite import 路径进入浏览器 runtime，适用于用户插件依赖源码别名或 Vite transform 的场景。
 */
async function loadSnapdomPlugins(
  options: RuntimeScreenshotOptions
): Promise<unknown[]> {
  const loadModule = createModuleLoader(options)

  return Promise.all(
    options.snapdom.plugins.map((plugin) => loadPluginImport(plugin, loadModule))
  )
}

/**
 * 创建模块加载器。
 *
 * 独立函数可以让测试注入 fake loader，同时真实运行时保留 Vite 对动态 import 的处理。
 */
function createModuleLoader(
  options: RuntimeScreenshotOptions
): (path: string) => Promise<Record<string, unknown>> {
  return options.loadModule ?? loadConfiguredModule
}

/**
 * 从虚拟模块读取用户配置模块。
 *
 * 这里仅读取已注册表，不直接 import 虚拟模块；发布包中的 runtime client 会被 Vite 依赖优化扫描，
 * 保留虚拟 import 会让用户项目在启动阶段失败。
 */
function loadConfiguredModule(
  path: string
): Promise<Record<string, unknown>> {
  const mod = screenshotModuleRegistry[path]

  if (!mod) {
    throw new Error(`screenshot module is not registered: ${path}`)
  }

  return Promise.resolve(mod)
}

/**
 * 加载单个插件声明。
 *
 * 插件模块可能直接导出插件对象，也可能导出插件工厂；这里按是否提供 options 决定是否调用工厂。
 */
async function loadPluginImport(
  plugin: SnapdomPluginImport,
  loadModule: (path: string) => Promise<Record<string, unknown>>
): Promise<unknown> {
  const normalized =
    typeof plugin === 'string'
      ? { path: plugin, exportName: 'default' }
      : { exportName: 'default', ...plugin }
  const mod = await loadModule(normalized.path)
  const exported = mod[normalized.exportName]

  if (isPluginFactory(exported) && 'options' in normalized) {
    return exported(normalized.options)
  }

  return exported
}

/**
 * 判断导出值是否是插件工厂。
 *
 * 动态 import 的模块导出是 unknown，先收窄再调用可以避免把任意值当函数执行。
 */
function isPluginFactory(value: unknown): value is (options: unknown) => unknown {
  return typeof value === 'function'
}

/**
 * 加载默认导出函数。
 *
 * filter 和 fallbackURL 是 snapdom 原生函数型扩展，路径化加载能保留函数能力但不跨运行时序列化函数。
 */
async function loadDefaultExport(
  loadModule: (path: string) => Promise<Record<string, unknown>>,
  path: string
): Promise<unknown> {
  return (await loadModule(path)).default
}

/**
 * 生成图片 mime type。
 *
 * MCP 响应需要明确 mime type，方便客户端按格式解码 base64 图片。
 */
function createMimeType(format: ScreenshotFormat): string {
  return `image/${format}`
}

/**
 * 将 Blob 转成 base64。
 *
 * runtime 运行在浏览器里不能依赖 Node Buffer，因此使用 ArrayBuffer 和 btoa 完成编码。
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

/**
 * 删除 undefined 配置。
 *
 * snapdom options 里保留 undefined 没有语义，清理后更容易在测试和调试时确认真实传参。
 */
function removeUndefinedEntries(
  value: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  )
}

/**
 * 创建缺失 snapdom 的错误。
 *
 * 错误文案必须包含安装命令，方便 MCP 客户端和大模型直接指导用户修复环境。
 */
function createMissingSnapdomError(): Error {
  return new Error(
    '缺少可选依赖 @zumer/snapdom。DOM 截图降级需要该依赖，请执行：pnpm add -D @zumer/snapdom'
  )
}
