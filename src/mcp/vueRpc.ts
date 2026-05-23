import type { VueMcpNextContext, VueRuntimeRpc } from '../types'

/**
 * 创建服务端 Vue RPC 回调对象。
 *
 * 浏览器端会调用 `on*Updated` 把 Vue DevTools 数据送回服务端，服务端再用 hook event
 * 唤醒对应 MCP 工具请求；这种事件名隔离可以避免并发请求互相串数据。
 */
export function createServerVueRuntimeRpc(
  ctx: VueMcpNextContext
): VueRuntimeRpc {
  return {
    getDomTree: () => undefined,
    onDomTreeUpdated: (event, data) => {
      void ctx.hooks.callHook(event, data)
    },
    queryDom: () => undefined,
    onDomQueryUpdated: (event, data) => {
      void ctx.hooks.callHook(event, data)
    },
    reloadPage: () => undefined,
    onPageReloaded: (event, data) => {
      void ctx.hooks.callHook(event, data)
    },
    evaluateScript: () => undefined,
    onEvaluateScriptUpdated: (event, data) => {
      void ctx.hooks.callHook(event, data)
    },
    takeScreenshot: () => undefined,
    onScreenshotTaken: (event, data) => {
      void ctx.hooks.callHook(event, data)
    },
    recordPerformance: () => undefined,
    onPerformanceRecorded: (event, data) => {
      void ctx.hooks.callHook(event, data)
    },
    startPerformanceRecording: () => undefined,
    onPerformanceRecordingStarted: (event, data) => {
      void ctx.hooks.callHook(event, data)
    },
    stopPerformanceRecording: () => undefined,
    onPerformanceRecordingStopped: (event, data) => {
      void ctx.hooks.callHook(event, data)
    },
    getInspectorTree: () => undefined,
    onInspectorTreeUpdated: (event, data) => {
      void ctx.hooks.callHook(event, data)
    },
    getInspectorState: () => undefined,
    onInspectorStateUpdated: (event, data) => {
      void ctx.hooks.callHook(event, data)
    },
    editComponentState: () => undefined,
    highlightComponent: () => undefined,
    getRouterInfo: () => undefined,
    onRouterInfoUpdated: (event, data) => {
      void ctx.hooks.callHook(event, data)
    },
    getPiniaTree: () => undefined,
    onPiniaTreeUpdated: (event, data) => {
      void ctx.hooks.callHook(event, data)
    },
    getPiniaState: () => undefined,
    onPiniaInfoUpdated: (event, data) => {
      void ctx.hooks.callHook(event, data)
    }
  }
}
