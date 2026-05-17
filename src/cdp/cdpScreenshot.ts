/**
 * CDP 页面截图能力。
 *
 * 该文件只封装浏览器真实截图路径，适用于用户已经提供 CDP endpoint 的开发场景；
 * runtime 的 snapdom 降级截图放在浏览器端模块里，避免两种准确度不同的实现混在一起。
 */
import type CDP from 'chrome-remote-interface'
import type { ScreenshotFormat, ScreenshotTarget } from '../types'

/**
 * CDP 截图参数。
 *
 * CDP 截图需要直接操作浏览器调试协议，因此这里要求调用方传入已连接 client，
 * 让连接生命周期仍由 MCP 工具层统一管理。
 */
export interface CdpCaptureScreenshotOptions {
  /** 已连接的 CDP client，适用于按次调用后立即关闭的工具执行模式。 */
  readonly client: CDP.Client
  /** 截图目标范围，用于在视口、整页和元素 clip 之间选择不同坐标来源。 */
  readonly target: ScreenshotTarget
  /** 输出格式会影响浏览器截图编码和 MCP 响应体积。 */
  readonly format: ScreenshotFormat
  /** 有损格式质量，适用于 jpeg/webp 降低响应体积的场景。 */
  readonly quality?: number
  /** 元素截图选择器，只在 `target: "element"` 时使用。 */
  readonly selector?: string
}

/**
 * CDP 截图结果。
 *
 * MCP 工具层需要统一计算体积和响应结构，因此 helper 只返回原始 base64 与尺寸。
 */
export interface CdpScreenshotResult {
  /** 浏览器返回的 base64 图片数据，不包含 data URL 前缀。 */
  readonly data: string
  /** 截图 CSS 像素宽度，用于让客户端理解图片尺寸。 */
  readonly width: number
  /** 截图 CSS 像素高度，用于让客户端理解图片尺寸。 */
  readonly height: number
}

/**
 * 使用 CDP 捕获真实浏览器截图。
 *
 * CDP 是最高准确度路径，适合需要覆盖 canvas、video、复杂 CSS 和真实浏览器渲染像素的场景。
 */
export async function cdpCaptureScreenshot(
  options: CdpCaptureScreenshotOptions
): Promise<CdpScreenshotResult> {
  if (options.target === 'element') {
    return captureElementScreenshot(options)
  }

  if (options.target === 'fullPage') {
    return captureFullPageScreenshot(options)
  }

  return captureViewportScreenshot(options)
}

/**
 * 捕获当前视口截图。
 *
 * 视口截图不改变页面滚动和尺寸，适合快速获取用户当前正在看的页面状态。
 */
async function captureViewportScreenshot(
  options: CdpCaptureScreenshotOptions
): Promise<CdpScreenshotResult> {
  const metrics = await options.client.Page.getLayoutMetrics()
  const width = Math.ceil(metrics.cssLayoutViewport.clientWidth)
  const height = Math.ceil(metrics.cssLayoutViewport.clientHeight)
  const result = await options.client.Page.captureScreenshot(
    omitUndefined({
      format: options.format,
      quality: createQuality(options),
      captureBeyondViewport: false
    })
  )

  return { data: result.data, width, height }
}

/**
 * 捕获整页截图。
 *
 * 整页截图需要使用内容尺寸作为 clip，否则长页面只会返回当前视口。
 */
async function captureFullPageScreenshot(
  options: CdpCaptureScreenshotOptions
): Promise<CdpScreenshotResult> {
  const metrics = await options.client.Page.getLayoutMetrics()
  const width = Math.ceil(metrics.cssContentSize.width)
  const height = Math.ceil(metrics.cssContentSize.height)
  const result = await options.client.Page.captureScreenshot(
    omitUndefined({
      format: options.format,
      quality: createQuality(options),
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 }
    })
  )

  return { data: result.data, width, height }
}

/**
 * 捕获指定元素截图。
 *
 * 元素 clip 通过页面运行时计算真实布局位置，适合 Vue 组件或局部区域调试。
 */
async function captureElementScreenshot(
  options: CdpCaptureScreenshotOptions
): Promise<CdpScreenshotResult> {
  if (!options.selector) {
    throw new Error('selector is required when target is element')
  }

  const rect = await getElementRect(options.client, options.selector)
  const result = await options.client.Page.captureScreenshot(
    omitUndefined({
      format: options.format,
      quality: createQuality(options),
      captureBeyondViewport: true,
      clip: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        scale: 1
      }
    })
  )

  return { data: result.data, width: rect.width, height: rect.height }
}

/**
 * 读取元素页面坐标。
 *
 * CDP DOM box model 在不同页面状态下需要 nodeId 绑定；这里使用页面表达式可以更直接匹配用户传入的 selector。
 */
async function getElementRect(
  client: CDP.Client,
  selector: string
): Promise<CdpElementRect> {
  const result = await client.Runtime.evaluate({
    expression: createElementRectExpression(selector),
    awaitPromise: true,
    returnByValue: true
  })

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'element query failed')
  }

  const value = result.result.value as unknown

  if (!isElementRect(value)) {
    throw new Error(`element not found: ${selector}`)
  }

  return value
}

/**
 * 生成元素坐标表达式。
 *
 * selector 必须使用 JSON.stringify 注入，避免 CSS 选择器中的引号破坏执行脚本。
 */
function createElementRectExpression(selector: string): string {
  return `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    x: rect.x + window.scrollX,
    y: rect.y + window.scrollY,
    width: rect.width,
    height: rect.height
  };
})()`
}

/**
 * 生成有损格式质量参数。
 *
 * PNG 没有质量参数；省略 undefined 可以让测试和协议请求都保持干净。
 */
function createQuality(
  options: CdpCaptureScreenshotOptions
): number | undefined {
  return options.format === 'png' ? undefined : options.quality
}

/**
 * 删除 undefined 字段。
 *
 * CDP 请求对象会进入测试断言和协议层，移除空值可以避免把无意义字段传给浏览器。
 */
function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T
}

/**
 * 元素截图坐标。
 *
 * CDP clip 使用 CSS 像素坐标，因此只保留浏览器截图所需的四个数值字段。
 */
interface CdpElementRect {
  /** 页面 X 坐标，包含滚动偏移，适合传给 CDP clip。 */
  readonly x: number
  /** 页面 Y 坐标，包含滚动偏移，适合传给 CDP clip。 */
  readonly y: number
  /** 元素宽度，适合限定局部截图范围。 */
  readonly width: number
  /** 元素高度，适合限定局部截图范围。 */
  readonly height: number
}

/**
 * 校验元素坐标结构。
 *
 * CDP evaluate 返回 unknown，必须在协议边界显式校验，避免错误值传入截图 clip。
 */
function isElementRect(value: unknown): value is CdpElementRect {
  if (!value || typeof value !== 'object') {
    return false
  }

  const rect = value as Partial<CdpElementRect>

  return (
    typeof rect.x === 'number' &&
    typeof rect.y === 'number' &&
    typeof rect.width === 'number' &&
    rect.width > 0 &&
    typeof rect.height === 'number' &&
    rect.height > 0
  )
}
