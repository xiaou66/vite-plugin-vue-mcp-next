/**
 * Vue Runtime Bridge 负责把 Vue Devtools runtime API 暴露给 MCP 服务端。
 *
 * 该文件只处理 Vue 语义能力，适用于组件树、组件状态、Router 和 Pinia 等 CDP 无法直接表达的应用层信息。
 */
import {
  devtools,
  devtoolsRouterInfo,
  devtoolsState,
  getInspector,
  stringify,
  toggleHighPerfMode
} from '@vue/devtools-kit'
import { createRPCClient } from 'vite-dev-rpc'
import type { ViteHotContext } from 'vite-hot-client'
import type { VueRuntimeRpc } from '../types'
import { createRuntimeDevtoolsRpc } from './devtoolsBridge'

const PINIA_INSPECTOR_ID = 'pinia'
const COMPONENTS_INSPECTOR_ID = 'components'
const COMPONENT_HIGHLIGHT_DURATION = 5000

let highlightComponentTimeout: ReturnType<typeof setTimeout> | undefined

/**
 * 同步初始化 Vue Devtools hook。
 *
 * Vue 会在应用 mount 时读取全局 hook 并注册 app，因此该函数必须在任何异步等待前执行。
 */
export function initializeVueDevtoolsHook(): void {
  devtools.init()
}

/**
 * 安装 Vue Runtime RPC。
 *
 * RPC 依赖 Vite hot context 传输消息，因此只能在 hot context 创建成功后安装。
 */
export function installVueBridge(hot: ViteHotContext): void {
  const rpcRef: { current?: VueRuntimeRpc } = {}
  const rpc = createRPCClient<VueRuntimeRpc, VueRuntimeRpc>(
    'vite-plugin-vue-mcp-next',
    hot,
    createClientVueRuntimeRpc(() => {
      if (!rpcRef.current) {
        throw new Error('Vue runtime RPC is not initialized')
      }
      return rpcRef.current
    }),
    { timeout: -1 }
  )
  rpcRef.current = rpc
}

/**
 * 创建浏览器端 Vue RPC 实现。
 *
 * 函数单独拆分可以让每个 Vue 能力的错误边界集中处理，避免 MCP 请求因为某个组件缺失而崩溃。
 */
function createClientVueRuntimeRpc(getRpc: () => VueRuntimeRpc): VueRuntimeRpc {
  return {
    ...createRuntimeDevtoolsRpc(getRpc),
    async getInspectorTree(query) {
      const inspectorTree = await devtools.api.getInspectorTree({
        inspectorId: COMPONENTS_INSPECTOR_ID,
        filter: query.componentName ?? ''
      })
      getRpc().onInspectorTreeUpdated(query.event, inspectorTree[0])
    },
    onInspectorTreeUpdated: () => undefined,
    async getInspectorState(query) {
      const targetNode = await findComponentNode(query.componentName)
      if (!targetNode) {
        getRpc().onInspectorStateUpdated(
          query.event,
          createMissingComponentError(query.componentName)
        )
        return
      }

      const inspectorState = await devtools.api.getInspectorState({
        inspectorId: COMPONENTS_INSPECTOR_ID,
        nodeId: targetNode.id
      })
      getRpc().onInspectorStateUpdated(query.event, stringify(inspectorState))
    },
    onInspectorStateUpdated: () => undefined,
    async editComponentState(query) {
      const targetNode = await findComponentNode(query.componentName)
      if (!targetNode) {
        return
      }

      devtools.ctx.api.editInspectorState({
        app: null,
        inspectorId: COMPONENTS_INSPECTOR_ID,
        nodeId: targetNode.id,
        path: query.path,
        state: {
          remove: false,
          value: parseStateValue(query.value, query.valueType)
        },
        type: query.valueType,
        set: setStateValue
      })
    },
    async highlightComponent(query) {
      const targetNode = await findComponentNode(query.componentName)
      if (!targetNode) {
        return
      }

      if (highlightComponentTimeout) {
        clearTimeout(highlightComponentTimeout)
      }

      callVueDevtoolsHook('componentHighlight', { uid: targetNode.id })
      highlightComponentTimeout = setTimeout(() => {
        callVueDevtoolsHook('componentUnhighlight')
      }, COMPONENT_HIGHLIGHT_DURATION)
    },
    getRouterInfo(query) {
      getRpc().onRouterInfoUpdated(
        query.event,
        JSON.stringify(devtoolsRouterInfo, null, 2)
      )
    },
    onRouterInfoUpdated: () => undefined,
    async getPiniaTree(query) {
      const inspectorTree = await withPiniaHighPerfDisabled(() =>
        devtools.api.getInspectorTree({
          inspectorId: PINIA_INSPECTOR_ID,
          filter: ''
        })
      )
      getRpc().onPiniaTreeUpdated(query.event, inspectorTree)
    },
    onPiniaTreeUpdated: () => undefined,
    async getPiniaState(query) {
      const result = await withPiniaHighPerfDisabled(async () => {
        const payload = {
          inspectorId: PINIA_INSPECTOR_ID,
          nodeId: query.storeName
        }
        const inspector = getInspector(payload.inspectorId)

        if (inspector) {
          inspector.selectedNodeId = payload.nodeId
        }

        return devtools.ctx.api.getInspectorState(payload)
      })
      getRpc().onPiniaInfoUpdated(query.event, stringify(result))
    },
    onPiniaInfoUpdated: () => undefined
  }
}

/**
 * Vue DevTools editInspectorState 需要的 set 回调。
 *
 * 运行时 bridge 只负责把 MCP 请求转交给 DevTools API，实际状态写入由 DevTools 内部完成；
 * 这里提供保守赋值实现，保证新版类型要求满足且不引入额外依赖。
 */
function setStateValue(
  object: unknown,
  path?: string | string[],
  value?: unknown
): void {
  if (!object || typeof object !== 'object' || !path) {
    return
  }

  const keys = Array.isArray(path) ? path : [path]
  const lastKey = keys.at(-1)

  if (!lastKey) {
    return
  }

  ;(object as Record<string, unknown>)[lastKey] = value
}

/**
 * 按 MCP 输入类型解析组件状态值。
 *
 * DevTools Kit 当前只接收最终 value，不再接收旧版本的 type 字段，
 * 因此这里在 bridge 内部完成基础类型转换。
 */
function parseStateValue(value: string, valueType: string): unknown {
  if (valueType === 'number') {
    return Number(value)
  }

  if (valueType === 'boolean') {
    return value === 'true'
  }

  if (valueType === 'object' || valueType === 'array') {
    try {
      return JSON.parse(value) as unknown
    } catch {
      return value
    }
  }

  return value
}

/**
 * 调用 Vue DevTools 内部 hook。
 *
 * 当前 @vue/devtools-kit 的公开类型没有覆盖组件高亮 hook，但运行时仍提供该能力；
 * 单独收敛类型逃逸可以避免把不稳定内部事件扩散到业务逻辑。
 */
function callVueDevtoolsHook(name: string, payload?: unknown): void {
  const hooks = devtools.ctx.hooks as {
    callHook: (event: string, payload?: unknown) => void
  }
  hooks.callHook(name, payload)
}

/**
 * 查找组件节点。
 *
 * 组件名来自 MCP 输入，运行时必须处理找不到组件的情况，而不是直接访问 undefined.id。
 */
async function findComponentNode(
  componentName: string
): Promise<{ id: string; name?: string; children?: unknown[] } | undefined> {
  const inspectorTree = await devtools.api.getInspectorTree({
    inspectorId: COMPONENTS_INSPECTOR_ID,
    filter: ''
  })
  const nodes = flattenTree(inspectorTree[0])

  return nodes.find((node) => node.name === componentName)
}

/**
 * 展平 Vue inspector tree。
 *
 * Vue DevTools 返回树状结构，按组件名查找状态和高亮目标时需要递归展开。
 */
function flattenTree(
  root: unknown
): Array<{ id: string; name?: string; children?: unknown[] }> {
  const result: Array<{ id: string; name?: string; children?: unknown[] }> = []

  const traverse = (node: unknown): void => {
    if (!isInspectorNode(node)) {
      return
    }

    result.push(node)
    node.children?.forEach((child) => {
      traverse(child)
    })
  }

  traverse(root)
  return result
}

/**
 * 校验 Vue inspector 节点的最小结构。
 *
 * DevTools 数据结构可能随版本变化，使用窄类型保护可以降低运行时异常风险。
 */
function isInspectorNode(
  node: unknown
): node is { id: string; name?: string; children?: unknown[] } {
  return Boolean(
    node &&
    typeof node === 'object' &&
    typeof (node as { id?: unknown }).id === 'string'
  )
}

/**
 * 临时关闭 Pinia high perf mode 后执行读取。
 *
 * Pinia inspector 在高性能模式下可能不返回完整状态，读取后恢复原状态可以避免影响用户调试体验。
 */
async function withPiniaHighPerfDisabled<T>(
  callback: () => Promise<T>
): Promise<T> {
  const highPerfModeEnabled = devtoolsState.highPerfModeEnabled

  if (highPerfModeEnabled) {
    toggleHighPerfMode(false)
  }

  try {
    return await callback()
  } finally {
    if (highPerfModeEnabled) {
      toggleHighPerfMode(true)
    }
  }
}

/**
 * 创建组件缺失错误。
 *
 * 返回结构化错误比抛异常更适合 MCP 场景，AI 可以直接把原因反馈给用户。
 */
function createMissingComponentError(componentName: string): {
  ok: false
  error: string
} {
  return {
    ok: false,
    error: `component not found: ${componentName}`
  }
}
