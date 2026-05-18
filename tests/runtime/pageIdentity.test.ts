import { describe, expect, it } from 'vitest'
import {
  createRuntimePageId,
  getRuntimeClientId,
  getRuntimePageIdentity,
  type RuntimeClientIdTabScope
} from '../../src/runtime/pageIdentity'

describe('runtime page identity', () => {
  it('creates stable page id prefix for runtime targets', () => {
    expect(createRuntimePageId()).toMatch(/^runtime-/)
  })

  it('reuses runtime client id from session storage', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem(key: string) {
        return values.get(key) ?? null
      },
      setItem(key: string, value: string) {
        values.set(key, value)
      }
    }

    const firstClientId = getRuntimeClientId(storage)
    const secondClientId = getRuntimeClientId(storage)

    expect(firstClientId).toBe(secondClientId)
    expect(firstClientId).toMatch(/^runtime-client-/)
  })

  it('creates a new runtime client id when a new tab inherits session storage', () => {
    const values = new Map<string, string>([
      ['vite-plugin-vue-mcp-next:runtime-client-id', 'runtime-client-cloned']
    ])
    const storage = {
      getItem(key: string) {
        return values.get(key) ?? null
      },
      setItem(key: string, value: string) {
        values.set(key, value)
      }
    }
    const tabScope: RuntimeClientIdTabScope = { name: '' }

    const firstClientId = getRuntimeClientId(storage, tabScope)
    const secondClientId = getRuntimeClientId(storage, tabScope)

    expect(firstClientId).not.toBe('runtime-client-cloned')
    expect(secondClientId).toBe(firstClientId)
    expect(tabScope.name).toContain(firstClientId)
    expect(tabScope.__VITE_MCP_NEXT_RUNTIME_CLIENT_ID__).toBe(firstClientId)
  })

  it('prefers runtime client id stored on the current window object', () => {
    const values = new Map<string, string>([
      ['vite-plugin-vue-mcp-next:runtime-client-id', 'runtime-client-storage'],
    ])
    const storage = {
      getItem(key: string) {
        return values.get(key) ?? null
      },
      setItem(key: string, value: string) {
        values.set(key, value)
      }
    }
    const tabScope = {
      name: 'vite-plugin-vue-mcp-next:runtime-client-id=runtime-client-window-name',
      __VITE_MCP_NEXT_RUNTIME_CLIENT_ID__: 'runtime-client-window'
    }

    expect(getRuntimeClientId(storage, tabScope)).toBe('runtime-client-window')
    expect(values.get('vite-plugin-vue-mcp-next:runtime-client-id')).toBe(
      'runtime-client-window'
    )
  })

  it('builds page identity from window-like input', () => {
    const identity = getRuntimePageIdentity({
      href: 'http://localhost:5173/admin.html?x=1',
      title: 'Admin',
      runtimeClientId: 'runtime-client-1',
      innerWidth: 1200,
      innerHeight: 800,
      readyState: 'complete'
    })

    expect(identity.runtimeClientId).toBe('runtime-client-1')
    expect(identity.pathname).toBe('/admin.html')
    expect(identity.title).toBe('Admin')
    expect(identity.viewport).toEqual({ width: 1200, height: 800 })
    expect(identity.readyState).toBe('complete')
  })
})
