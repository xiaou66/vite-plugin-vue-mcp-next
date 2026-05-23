/**
 * 性能通道路由判断。
 *
 * 该文件只判断 performance 相关能力应该走 CDP、Runtime Hook 还是显式关闭，不承载任何采集逻辑。
 */
import type { PerformanceMode } from '../types'

/**
 * 性能通道选择结果。
 *
 * 返回值只表达工具层该走哪条采集路径，真正的连接失败和能力限制由调用方单独转成结构化错误。
 */
export type PerformanceTransport = 'cdp' | 'hook' | 'off'

/**
 * 性能通道判断输入。
 *
 * 这层输入只关心模式和是否存在可用 CDP 条件，不直接触碰具体客户端对象。
 */
export interface ResolvePerformanceTransportInput {
  /** 用户配置的性能模式。 */
  readonly mode: PerformanceMode
  /** 是否找到了可以匹配当前页面的 CDP target。 */
  readonly hasCdpTarget: boolean
  /** 是否存在可连接的 CDP 端点。 */
  readonly hasCdpEndpoint: boolean
}

/**
 * 决定性能采集应该走哪条通道。
 *
 * `auto` 会在 CDP 条件齐备时优先使用调试协议，否则回退到 runtime；`hook` 强制走 runtime；`off` 直接关闭。
 */
export function resolvePerformanceTransport(
  input: ResolvePerformanceTransportInput
): PerformanceTransport {
  if (input.mode === 'off') {
    return 'off'
  }

  if (input.mode === 'hook') {
    return 'hook'
  }

  if (input.hasCdpTarget && input.hasCdpEndpoint) {
    return 'cdp'
  }

  return 'hook'
}
