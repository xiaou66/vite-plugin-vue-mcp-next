import { createHotContext } from 'vite-hot-client'
import { installConsoleHook } from './consoleHook'
import { installNetworkHook } from './networkHook'
import { getRuntimePageIdentity } from './pageIdentity'
import { installVueBridge } from './vueBridge'
export { evaluateExpression } from './evaluateExpression'
export type { RuntimeEvaluateRequest } from './evaluateExpression'

/**
 * 启动浏览器端 Runtime Bridge。
 *
 * 运行时脚本负责连接 Vite WebSocket 并上报页面身份；Vue、Console、Network 等子能力
 * 会在后续任务中挂到这个启动流程中。
 */
export async function startRuntimeClient(): Promise<void> {
  const hot = await createHotContext('vite-plugin-vue-mcp-next', '/')

  if (!hot) {
    return
  }

  installVueBridge(hot)

  const identity = getRuntimePageIdentity({
    href: window.location.href,
    title: document.title,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    readyState: document.readyState
  })

  hot.send('vite-plugin-vue-mcp-next:page-connected', identity)
  installConsoleHook({
    pageId: identity.pageId,
    send(record) {
      hot.send('vite-plugin-vue-mcp-next:console-record', record)
    }
  })
  installNetworkHook({
    pageId: identity.pageId,
    maxBodySize: 100_000,
    maskHeaders: ['authorization', 'cookie', 'set-cookie'],
    send(record) {
      hot.send('vite-plugin-vue-mcp-next:network-record', record)
    }
  })
}
