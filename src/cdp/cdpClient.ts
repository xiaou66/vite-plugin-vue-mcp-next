import CDP from 'chrome-remote-interface'
import type { CdpOptions } from '../types'
import type { CdpTargetSummary } from './targetMatcher'

/**
 * CDP 客户端封装。
 *
 * 插件只连接用户提供的调试端点，不负责启动浏览器；封装该层可以隔离第三方库类型和连接细节。
 */
export interface CdpClient {
  /** 列出浏览器当前暴露的调试 target。 */
  listTargets(): Promise<CdpTargetSummary[]>
  /** 连接指定 WebSocket endpoint。 */
  connect(wsEndpoint: string): Promise<CDP.Client>
}

/**
 * 创建 CDP 客户端。
 *
 * browserUrl 和 wsEndpoint 支持不同接入方式：前者适合 Chrome remote debugging port，
 * 后者适合外部工具直接提供的页面 endpoint。
 */
export function createCdpClient(options: CdpOptions): CdpClient {
  return {
    async listTargets() {
      if (!options.browserUrl) {
        return []
      }

      const listUrl = new URL('/json/list', options.browserUrl)
      const response = await fetch(listUrl)

      return (await response.json()) as CdpTargetSummary[]
    },
    async connect(wsEndpoint) {
      return CDP({ target: wsEndpoint })
    }
  }
}
