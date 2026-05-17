/**
 * MCP 页面截图工具。
 *
 * 该文件负责在服务端选择 CDP 真截图或 runtime snapdom 降级截图，适用于不同客户端和浏览器调试能力不一致的场景。
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { MCP_TOOL_NAMES } from '../../constants'
import { cdpCaptureScreenshot } from '../../cdp/cdpScreenshot'
import type {
  ScreenshotFormat,
  ScreenshotPrefer,
  ScreenshotTarget,
  VueMcpNextContext
} from '../../types'
import {
  closeCdpClient,
  connectCdpForPage,
  createToolError,
  createToolResponse,
  requestRuntimeData
} from '../routeTools'
import {
  createScreenshotOutput,
  type ScreenshotImagePayload
} from './screenshotOutput'

/** 截图工具默认目标，适合用户不关心整页或局部区域时获取当前视口。 */
const DEFAULT_SCREENSHOT_TARGET: ScreenshotTarget = 'viewport'

/** 截图工具默认格式，PNG 对普通 UI 截图更稳定且无损。 */
const DEFAULT_SCREENSHOT_FORMAT: ScreenshotFormat = 'png'

/**
 * MCP 截图工具输入 schema。
 *
 * 这里保持和其他工具一致使用 zod 字段对象，方便 MCP SDK 生成参数声明。
 */
const screenshotInputSchema = {
  pageId: z.string().optional(),
  target: z.enum(['viewport', 'fullPage', 'element']).optional(),
  selector: z.string().optional(),
  format: z.enum(['png', 'jpeg', 'webp']).optional(),
  prefer: z.enum(['auto', 'cdp', 'runtime']).optional(),
  quality: z.number().optional(),
  scale: z.number().optional(),
  snapdom: z.record(z.string(), z.unknown()).optional()
}

/**
 * 截图工具输入。
 *
 * MCP SDK 会基于 zod schema 校验入参；内部显式接口让后续 helper 不依赖 SDK 泛型细节。
 */
interface ScreenshotToolInput {
  /** 页面目标 ID，适合多 tab 或多入口页面时精确选择截图对象。 */
  readonly pageId?: string
  /** 截图目标范围，默认视口以减少响应体积。 */
  readonly target?: ScreenshotTarget
  /** 元素截图选择器，只在 `target: "element"` 时需要。 */
  readonly selector?: string
  /** 图片格式，默认 PNG 以优先保证 UI 清晰度。 */
  readonly format?: ScreenshotFormat
  /** 单次截图通道偏好，适合临时强制验证 runtime 降级效果。 */
  readonly prefer?: ScreenshotPrefer
  /** 有损格式质量，适合临时降低 jpeg/webp 体积。 */
  readonly quality?: number
  /** 单次 snapdom 缩放倍率覆盖值。 */
  readonly scale?: number
  /** 单次 snapdom JSON-safe options 覆盖值。 */
  readonly snapdom?: Record<string, unknown>
}

/**
 * 注册页面截图 MCP 工具。
 *
 * 截图能力可能返回较大的 base64，因此单独成组可以让体积限制和来源说明集中审查。
 */
export function registerScreenshotTools(
  server: McpServer,
  ctx: VueMcpNextContext
): void {
  server.registerTool(
    MCP_TOOL_NAMES.takeScreenshot,
    {
      description: 'Take a page screenshot using CDP or snapdom fallback.',
      inputSchema: screenshotInputSchema
    },
    async (input) => handleTakeScreenshot(ctx, input as ScreenshotToolInput)
  )
}

/**
 * 执行截图工具。
 *
 * `auto` 优先 CDP 是为了尽量返回真实浏览器像素；CDP 不可用时才降级到 snapdom 并标记来源。
 */
async function handleTakeScreenshot(
  ctx: VueMcpNextContext,
  input: ScreenshotToolInput
) {
  const target = input.target ?? DEFAULT_SCREENSHOT_TARGET
  const format = input.format ?? DEFAULT_SCREENSHOT_FORMAT
  const prefer = input.prefer ?? ctx.options.screenshot.prefer

  if (target === 'element' && !input.selector) {
    return createToolError('selector is required when target is element')
  }

  if (prefer !== 'runtime') {
    const cdp = await connectCdpForPage(ctx, input.pageId)

    if (cdp) {
      try {
        const screenshot = await cdpCaptureScreenshot({
          client: cdp.client,
          target,
          selector: input.selector,
          format,
          quality: input.quality
        })

        return await createScreenshotResponse(ctx, {
          source: 'cdp',
          target,
          format,
          data: screenshot.data,
          width: screenshot.width,
          height: screenshot.height,
          mimeType: createMimeType(format),
          byteLength: getBase64ByteLength(screenshot.data)
        })
      } finally {
        await closeCdpClient(cdp.client)
      }
    }

    if (prefer === 'cdp') {
      return createToolError('CDP screenshot is unavailable')
    }
  }

  return createRuntimeScreenshot(ctx, input, { target, format })
}

/**
 * 请求浏览器 runtime 执行 snapdom 截图。
 *
 * snapdom 必须在页面上下文运行，服务端只负责传入可序列化配置并校验返回体积。
 */
async function createRuntimeScreenshot(
  ctx: VueMcpNextContext,
  input: ScreenshotToolInput,
  normalized: { target: ScreenshotTarget; format: ScreenshotFormat }
) {
  const result = await requestRuntimeData(ctx, (event) => {
    void ctx.rpcServer?.takeScreenshot({
      event,
      target: normalized.target,
      selector: input.selector,
      format: normalized.format,
      quality: input.quality,
      scale: input.scale,
      snapdom: {
        ...ctx.options.screenshot.snapdom,
        options: {
          ...ctx.options.screenshot.snapdom.options,
          ...input.snapdom
        }
      }
    })
  })

  if (isScreenshotTooLarge(ctx, result)) {
    return createToolError(
      `screenshot is too large: ${String(result.byteLength)} bytes`
    )
  }

  if (!isPlainRecord(result)) {
    return createToolError('runtime screenshot returned an invalid response')
  }

  if (result.ok === false) {
    return createToolResponse(result)
  }

  if (!isScreenshotImagePayload(result)) {
    return createToolError('runtime screenshot returned an invalid response')
  }

  return createScreenshotResponse(ctx, {
    ...result,
    target: normalized.target,
    format: normalized.format
  })
}

/**
 * 创建截图响应。
 *
 * CDP 和 runtime 都必须经过同一个体积限制，避免某条通道绕过 MCP 响应保护。
 */
async function createScreenshotResponse(
  ctx: VueMcpNextContext,
  result: ScreenshotImagePayload
) {
  if (result.byteLength > ctx.options.screenshot.maxBytes) {
    return createToolError(
      `screenshot is too large: ${String(result.byteLength)} bytes`
    )
  }

  try {
    return createToolResponse(await createScreenshotOutput(ctx, result))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return createToolError(`failed to create screenshot output: ${message}`)
  }
}

/**
 * 判断 runtime 截图是否超过体积限制。
 *
 * runtime 回传是 unknown，必须先做结构检查再读取 byteLength。
 */
function isScreenshotTooLarge(
  ctx: VueMcpNextContext,
  result: unknown
): result is { byteLength: number } {
  return (
    isPlainRecord(result) &&
    'byteLength' in result &&
    typeof result.byteLength === 'number' &&
    result.byteLength > ctx.options.screenshot.maxBytes
  )
}

/**
 * 校验结构化响应对象。
 *
 * MCP structuredContent 必须是对象；runtime 回传来自浏览器边界，不能直接信任 unknown。
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 生成图片 mime type。
 *
 * 服务端 CDP 响应不含 data URL 前缀，显式 mime type 可以让 MCP 客户端正确解码。
 */
function createMimeType(format: ScreenshotFormat): string {
  return `image/${format}`
}

/**
 * 计算 base64 原始字节数。
 *
 * CDP 返回的是不带 data URL 前缀的 base64，按 padding 修正可以更准确执行 maxBytes 限制。
 */
function getBase64ByteLength(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return Math.ceil((data.length * 3) / 4) - padding
}

/**
 * 校验 runtime 成功截图结果。
 *
 * 浏览器 runtime 返回 unknown，服务端必须确认图片字段完整后才能写入文件系统。
 */
function isScreenshotImagePayload(
  result: Record<string, unknown>
): result is ScreenshotImagePayload {
  return (
    (result.source === 'cdp' || result.source === 'snapdom') &&
    typeof result.data === 'string' &&
    typeof result.width === 'number' &&
    typeof result.height === 'number' &&
    typeof result.mimeType === 'string' &&
    typeof result.byteLength === 'number'
  )
}
