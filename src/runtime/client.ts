/**
 * Runtime Client 是注入到浏览器页面的启动入口。
 *
 * 该文件负责协调 Vue、Console、Network 等浏览器端 hook 的安装，并通过 Vite hot context 上报页面状态。
 */
import { createHotContext } from 'vite-hot-client'
import {
  DEFAULT_OPTIONS,
  DEFAULT_RUNTIME_PAGE_HEARTBEAT_INTERVAL_MS,
  RUNTIME_PAGE_CONNECTED_EVENT,
  RUNTIME_PAGE_DISCONNECTED_EVENT,
  RUNTIME_PAGE_HEARTBEAT_EVENT
} from '../constants'
import type { RuntimeClientOptions } from '../types'
import { installConsoleHook } from './consoleHook'
import { installElementPicker } from './elementPicker'
import {
  createElementContextResolver,
  setElementContextResolver
} from './elementContext'
import { runtimeElementRegistry } from './elementRegistry'
import { installNetworkHook } from './networkHook'
import { getRuntimeClientId, getRuntimePageIdentity } from './pageIdentity'
import { installPerformanceHook } from './performanceHook'
export { setScreenshotModuleRegistry, setSnapdomLoader } from './screenshot'
import { initializeVueDevtoolsHook, installVueBridge } from './vueBridge'
export { evaluateExpression } from './evaluateExpression'
export type { RuntimeEvaluateRequest } from './evaluateExpression'

/**
 * 启动浏览器端 Runtime Bridge。
 *
 * Vue Devtools hook 必须在等待 Vite hot context 前同步初始化，否则 Vue app 挂载时会错过注册窗口。
 */
export async function startRuntimeClient(
  runtimeOptions: RuntimeClientOptions = {
    elementPicker: DEFAULT_OPTIONS.elementPicker
  }
): Promise<void> {
  initializeVueDevtoolsHook()

  const hot = await createHotContext('vite-plugin-vue-mcp-next', '/')

  if (!hot) {
    return
  }

  installVueBridge(hot)
  installElementPicker(runtimeOptions.elementPicker)

  const identity = getRuntimePageIdentity({
    href: window.location.href,
    title: document.title,
    runtimeClientId: getRuntimeClientId(window.sessionStorage, window),
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    readyState: document.readyState
  })

  setElementContextResolver(
    createElementContextResolver({
      root: runtimeOptions.projectRoot ?? '/',
      registry: runtimeElementRegistry,
      querySelector(selector) {
        return document.querySelector(selector)
      }
    })
  )

  hot.send(RUNTIME_PAGE_CONNECTED_EVENT, identity)
  installRuntimePageLifecycle({
    pageId: identity.pageId,
    send: hot.send.bind(hot)
  })
  installPerformanceHook({
    pageId: identity.pageId,
    send(report) {
      hot.send('vite-plugin-vue-mcp-next:performance-record', report)
    }
  })
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

/**
 * 安装 runtime 页面生命周期上报。
 *
 * 该逻辑只负责上报连接、心跳和离开，不参与页面目标决策，避免把服务端语义带回浏览器侧。
 */
function installRuntimePageLifecycle(options: {
  readonly pageId: string
  readonly send: (event: string, payload: unknown) => void
}): void {
  let disconnected = false
  const heartbeatTimer = setInterval(() => {
    options.send(RUNTIME_PAGE_HEARTBEAT_EVENT, {
      pageId: options.pageId,
      timestamp: Date.now()
    })
  }, DEFAULT_RUNTIME_PAGE_HEARTBEAT_INTERVAL_MS)

  const disconnect = (): void => {
    if (disconnected) {
      return
    }

    disconnected = true
    clearInterval(heartbeatTimer)
    options.send(RUNTIME_PAGE_DISCONNECTED_EVENT, {
      pageId: options.pageId
    })
  }

  window.addEventListener('pagehide', disconnect, { once: true })
  window.addEventListener('beforeunload', disconnect, { once: true })
}
