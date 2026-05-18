/**
 * Runtime Client 是注入到浏览器页面的启动入口。
 *
 * 该文件负责协调 Vue、Console、Network 等浏览器端 hook 的安装，并通过 Vite hot context 上报页面状态。
 */
import { createHotContext } from 'vite-hot-client'
import { installConsoleHook } from './consoleHook'
import { installNetworkHook } from './networkHook'
import { getRuntimeClientId, getRuntimePageIdentity } from './pageIdentity'
export { setScreenshotModuleRegistry, setSnapdomLoader } from './screenshot'
import { initializeVueDevtoolsHook, installVueBridge } from './vueBridge'
export { evaluateExpression } from './evaluateExpression'
export type { RuntimeEvaluateRequest } from './evaluateExpression'

/**
 * 启动浏览器端 Runtime Bridge。
 *
 * Vue Devtools hook 必须在等待 Vite hot context 前同步初始化，否则 Vue app 挂载时会错过注册窗口。
 */
export async function startRuntimeClient(): Promise<void> {
  initializeVueDevtoolsHook()

  const hot = await createHotContext('vite-plugin-vue-mcp-next', '/')

  if (!hot) {
    return
  }

  installVueBridge(hot)

  const identity = getRuntimePageIdentity({
    href: window.location.href,
    title: document.title,
    runtimeClientId: getRuntimeClientId(window.sessionStorage, window),
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
