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
import { getPerformanceCollector } from './performanceHook'
import { createRuntimeDevtoolsRpc } from './devtoolsBridge'

const PINIA_INSPECTOR_ID = 'pinia'
const COMPONENTS_INSPECTOR_ID = 'components'
const COMPONENT_HIGHLIGHT_DURATION = 5000
const INSPECTOR_TREE_MAX_DEPTH = 20
const INSPECTOR_TREE_MAX_NODES = 500
const INSPECTOR_TREE_MAX_CHILDREN = 200
const INSPECTOR_TREE_MAX_TAGS = 20

const INSPECTOR_NODE_FIELDS = [
  'id',
  'label',
  'name',
  'inactive',
  'isFragment',
  'autoOpen'
] as const

interface InspectorTreeBudget {
  visited: number
}

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
 * 投影 inspector tree 列表。
 *
 * Pinia tree 返回数组，不能把原始 DevTools 节点直接交给 RPC；只保留 MCP 需要展示的节点字段。
 */
function projectInspectorTreeList(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return []
  }

  const budget: InspectorTreeBudget = { visited: 0 }
  return value.map((node) => projectInspectorNode(node, budget, 0))
}

/**
 * 投影单个 inspector tree 节点。
 *
 * 该函数只读取白名单字段和有限 children，避免展开 Vue component、vnode 或 DevTools 内部对象。
 */
function projectInspectorNode(
  value: unknown,
  budget: InspectorTreeBudget,
  depth: number
): unknown {
  if (!value || typeof value !== 'object') {
    return value
  }

  if (
    budget.visited >= INSPECTOR_TREE_MAX_NODES ||
    depth >= INSPECTOR_TREE_MAX_DEPTH
  ) {
    return '[Truncated]'
  }

  budget.visited += 1
  const result: Record<string, unknown> = {}

  INSPECTOR_NODE_FIELDS.forEach((field) => {
    const valueField = readInspectorField(value, field)
    if (valueField.ok && isInspectorPrimitive(valueField.value)) {
      result[field] = valueField.value
    }
  })

  const tags = readInspectorField(value, 'tags')
  if (tags.ok && Array.isArray(tags.value)) {
    result.tags = tags.value
      .slice(0, INSPECTOR_TREE_MAX_TAGS)
      .map(projectInspectorTag)
  }

  const children = readInspectorField(value, 'children')
  if (children.ok && Array.isArray(children.value)) {
    const projectedChildren = children.value
      .slice(0, INSPECTOR_TREE_MAX_CHILDREN)
      .map((child) => projectInspectorNode(child, budget, depth + 1))

    if (children.value.length > INSPECTOR_TREE_MAX_CHILDREN) {
      projectedChildren.push('[Truncated]')
    }

    result.children = projectedChildren
  }

  return result
}

/**
 * 投影 inspector tag。
 *
 * tag 只用于展示节点状态，保留浅层基础字段即可；复杂对象字段会被忽略。
 */
function projectInspectorTag(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value
  }

  const result: Record<string, unknown> = {}
  Object.keys(value)
    .filter((key) => key !== 'toJSON')
    .slice(0, 8)
    .forEach((key) => {
      const field = readInspectorField(value, key)
      if (field.ok && isInspectorPrimitive(field.value)) {
        result[key] = field.value
      }
    })

  return result
}

function readInspectorField(
  value: object,
  key: string
): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: (value as Record<string, unknown>)[key] }
  } catch {
    return { ok: false }
  }
}

function isInspectorPrimitive(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  )
}

/**
 * 创建浏览器端 Vue RPC 实现。
 *
 * 函数单独拆分可以让每个 Vue 能力的错误边界集中处理，避免 MCP 请求因为某个组件缺失而崩溃。
 */
export function createClientVueRuntimeRpc(
  getRpc: () => VueRuntimeRpc
): VueRuntimeRpc {
  return {
    ...createRuntimeDevtoolsRpc(getRpc),
    async getInspectorTree(query) {
      const inspectorTree = await devtools.api.getInspectorTree({
        inspectorId: COMPONENTS_INSPECTOR_ID,
        filter: query.componentName ?? ''
      })
      getRpc().onInspectorTreeUpdated(
        query.event,
        projectInspectorNode(inspectorTree[0], { visited: 0 }, 0)
      )
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
      getRpc().onPiniaTreeUpdated(
        query.event,
        projectInspectorTreeList(inspectorTree)
      )
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
    onPiniaInfoUpdated: () => undefined,
    async recordPerformance(query) {
      const collector = getPerformanceCollector()

      if (!collector) {
        getRpc().onPerformanceRecorded(
          query.event,
          createPerformanceUnavailableError()
        )
        return
      }

      try {
        const report = await collector.recordOnce({
          durationMs: query.durationMs,
          includeMemory: query.includeMemory,
          includeStacks: query.includeStacks
        })
        getRpc().onPerformanceRecorded(query.event, report)
      } catch (error) {
        getRpc().onPerformanceRecorded(
          query.event,
          createPerformanceError(error)
        )
      }
    },
    onPerformanceRecorded: () => undefined,
    startPerformanceRecording(query) {
      const collector = getPerformanceCollector()

      if (!collector) {
        getRpc().onPerformanceRecordingStarted(
          query.event,
          createPerformanceUnavailableError()
        )
        return
      }

      try {
        const recordingId = collector.start({
          includeMemory: query.includeMemory,
          includeStacks: query.includeStacks
        })
        getRpc().onPerformanceRecordingStarted(query.event, {
          ok: true,
          recordingId,
          startedAt: Date.now(),
          source: 'hook'
        })
      } catch (error) {
        getRpc().onPerformanceRecordingStarted(
          query.event,
          createPerformanceError(error)
        )
      }
    },
    onPerformanceRecordingStarted: () => undefined,
    stopPerformanceRecording(query) {
      const collector = getPerformanceCollector()

      if (!collector) {
        getRpc().onPerformanceRecordingStopped(
          query.event,
          createPerformanceUnavailableError()
        )
        return
      }

      try {
        const report = collector.stop(query.recordingId)
        getRpc().onPerformanceRecordingStopped(query.event, report)
      } catch (error) {
        getRpc().onPerformanceRecordingStopped(
          query.event,
          createPerformanceError(error)
        )
      }
    },
    onPerformanceRecordingStopped: () => undefined
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
 * 生成性能 RPC 不可用的统一错误回包。
 *
 * performance collector 只在 runtime client 完成安装后存在；如果 Vue bridge 先被调用，
 * 与其让请求悬空，不如明确告诉服务端稍后重试。
 */
function createPerformanceUnavailableError(): {
  readonly ok: false
  readonly error: string
} {
  return {
    ok: false,
    error: 'Performance collector is not initialized'
  }
}

/**
 * 把性能 RPC 异常收敛成结构化错误。
 *
 * 运行态采集不应该把异常直接抛回 RPC 调用链，否则会让整个 bridge 请求失败。
 */
function createPerformanceError(error: unknown): {
  readonly ok: false
  readonly error: string
} {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  }
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
