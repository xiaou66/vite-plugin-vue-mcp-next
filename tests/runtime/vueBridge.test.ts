import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VueRuntimeRpc } from '../../src/types'

const devtoolsApiMock = vi.hoisted(() => ({
  getInspectorTree: vi.fn(),
  getInspectorState: vi.fn()
}))

const devtoolsCtxApiMock = vi.hoisted(() => ({
  editInspectorState: vi.fn(),
  getInspectorState: vi.fn()
}))

const devtoolsStateMock = vi.hoisted(() => ({
  highPerfModeEnabled: false
}))

const getInspectorMock = vi.hoisted(() => vi.fn())

vi.mock('@vue/devtools-kit', () => ({
  devtools: {
    init: vi.fn(),
    api: devtoolsApiMock,
    ctx: {
      api: devtoolsCtxApiMock
    }
  },
  devtoolsRouterInfo: { currentRoute: { path: '/' } },
  devtoolsState: devtoolsStateMock,
  getInspector: getInspectorMock,
  stringify: (value: unknown) => JSON.stringify(value),
  toggleHighPerfMode: vi.fn()
}))

vi.mock('../../src/runtime/devtoolsBridge', () => ({
  createRuntimeDevtoolsRpc: () => ({})
}))

vi.mock('../../src/runtime/performanceHook', () => ({
  getPerformanceCollector: () => undefined
}))

function createDangerousNode<T extends Record<string, unknown>>(value: T): T {
  return new Proxy(value, {
    ownKeys(target) {
      return [...Reflect.ownKeys(target), 'toJSON']
    },
    getOwnPropertyDescriptor(target, key) {
      if (key === 'toJSON') {
        return { configurable: true, enumerable: true }
      }

      return Reflect.getOwnPropertyDescriptor(target, key)
    },
    get(target, key, receiver) {
      if (key === 'toJSON') {
        throw new Error('[birpc] function "toJSON" not found')
      }

      return Reflect.get(target, key, receiver)
    }
  })
}

function createReceiver(): {
  receiver: VueRuntimeRpc
  onInspectorTreeUpdated: ReturnType<typeof vi.fn>
  onPiniaTreeUpdated: ReturnType<typeof vi.fn>
} {
  const onInspectorTreeUpdated = vi.fn()
  const onPiniaTreeUpdated = vi.fn()

  return {
    receiver: {
      onInspectorTreeUpdated,
      onPiniaTreeUpdated
    } as unknown as VueRuntimeRpc,
    onInspectorTreeUpdated,
    onPiniaTreeUpdated
  }
}

describe('vue bridge inspector tree payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    devtoolsApiMock.getInspectorTree.mockReset()
    devtoolsStateMock.highPerfModeEnabled = false
  })

  it('projects component inspector tree nodes before sending RPC events', async () => {
    const root = createDangerousNode({
      id: 'root',
      name: 'App',
      label: 'App',
      component: { privateValue: true },
      children: [
        createDangerousNode({
          id: 'child',
          name: 'Counter',
          label: 'Counter',
          tags: [{ label: 'setup', textColor: 0, backgroundColor: 1 }]
        })
      ]
    })
    devtoolsApiMock.getInspectorTree.mockResolvedValue([root])
    const { receiver, onInspectorTreeUpdated } = createReceiver()
    const { createClientVueRuntimeRpc } = await import(
      '../../src/runtime/vueBridge'
    )

    const rpc = createClientVueRuntimeRpc(() => receiver)
    await rpc.getInspectorTree({ event: 'component-tree' })

    expect(onInspectorTreeUpdated).toHaveBeenCalledWith(
      'component-tree',
      {
        id: 'root',
        name: 'App',
        label: 'App',
        children: [
          {
            id: 'child',
            name: 'Counter',
            label: 'Counter',
            tags: [{ label: 'setup', textColor: 0, backgroundColor: 1 }]
          }
        ]
      }
    )
  })

  it('projects Pinia tree arrays before sending RPC events', async () => {
    const store = createDangerousNode({
      id: 'counter',
      label: 'Counter Store',
      state: { count: 1 }
    })
    devtoolsApiMock.getInspectorTree.mockResolvedValue([store])
    const { receiver, onPiniaTreeUpdated } = createReceiver()
    const { createClientVueRuntimeRpc } = await import(
      '../../src/runtime/vueBridge'
    )

    const rpc = createClientVueRuntimeRpc(() => receiver)
    await rpc.getPiniaTree({ event: 'pinia-tree' })

    expect(onPiniaTreeUpdated).toHaveBeenCalledWith('pinia-tree', [
      {
        id: 'counter',
        label: 'Counter Store'
      }
    ])
  })
})
