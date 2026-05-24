import { describe, expect, it } from 'vitest'
import { createRuntimeStorageBridge } from '../../src/runtime/storageBridge'

describe('createRuntimeStorageBridge', () => {
  it('lists and mutates same-origin localStorage and sessionStorage', async () => {
    const localStorage = createMemoryStorage({ token: 'alpha' })
    const sessionStorage = createMemoryStorage({ draft: 'beta' })

    const bridge = createRuntimeStorageBridge({
      origin: 'https://app.example',
      localStorage,
      sessionStorage,
      indexedDB: createMemoryIndexedDb()
    })

    const snapshot = await bridge.manageStorage({
      event: 'evt-1',
      pageId: 'page-1',
      origin: 'https://app.example',
      action: 'list',
      scope: 'localStorage'
    })

    expect(snapshot.ok).toBe(true)
    expect(snapshot.data).toMatchObject({
      scope: 'localStorage',
      entries: [{ key: 'token', value: 'alpha' }]
    })

    await bridge.manageStorage({
      event: 'evt-2',
      pageId: 'page-1',
      origin: 'https://app.example',
      action: 'set',
      scope: 'localStorage',
      key: 'theme',
      value: 'dark'
    })

    await bridge.manageStorage({
      event: 'evt-3',
      pageId: 'page-1',
      origin: 'https://app.example',
      action: 'delete',
      scope: 'sessionStorage',
      key: 'draft'
    })

    expect(localStorage.getItem('theme')).toBe('dark')
    expect(sessionStorage.getItem('draft')).toBeNull()
  })

  it('rejects cookie access and cross-origin requests in runtime mode', async () => {
    const bridge = createRuntimeStorageBridge({
      origin: 'https://app.example',
      localStorage: createMemoryStorage({}),
      sessionStorage: createMemoryStorage({}),
      indexedDB: createMemoryIndexedDb()
    })

    await expect(
      bridge.manageStorage({
        event: 'evt-1',
        pageId: 'page-1',
        origin: 'https://other.example',
        action: 'list',
        scope: 'localStorage'
      })
    ).resolves.toMatchObject({
      ok: false,
      error: 'Runtime storage access is limited to the current page origin'
    })

    await expect(
      bridge.manageStorage({
        event: 'evt-2',
        pageId: 'page-1',
        origin: 'https://app.example',
        action: 'list',
        scope: 'cookie'
      })
    ).resolves.toMatchObject({
      ok: false,
      error: 'Runtime cookie access is unavailable'
    })
  })

  it('mutates visible same-origin cookies through runtime document.cookie', async () => {
    const cookie = createMemoryCookieAccess()
    const bridge = createRuntimeStorageBridge({
      origin: 'https://app.example',
      localStorage: createMemoryStorage({}),
      sessionStorage: createMemoryStorage({}),
      indexedDB: createMemoryIndexedDb(),
      cookie
    })

    await bridge.manageStorage({
      event: 'evt-1',
      pageId: 'page-1',
      origin: 'https://app.example',
      action: 'set',
      scope: 'cookie',
      cookie: { name: 'sid', value: 'alpha', path: '/' }
    })

    await expect(
      bridge.manageStorage({
        event: 'evt-2',
        pageId: 'page-1',
        origin: 'https://app.example',
        action: 'get',
        scope: 'cookie',
        cookie: { name: 'sid' }
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        cookies: [{ name: 'sid', value: 'alpha' }]
      }
    })

    await bridge.manageStorage({
      event: 'evt-3',
      pageId: 'page-1',
      origin: 'https://app.example',
      action: 'delete',
      scope: 'cookie',
      cookie: { name: 'sid', path: '/' }
    })

    await expect(
      bridge.manageStorage({
        event: 'evt-4',
        pageId: 'page-1',
        origin: 'https://app.example',
        action: 'list',
        scope: 'cookie'
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        cookies: []
      }
    })
  })

  it('mutates indexedDB records through the same-origin runtime bridge', async () => {
    const indexedDB = createMemoryIndexedDb()
    const bridge = createRuntimeStorageBridge({
      origin: 'https://app.example',
      localStorage: createMemoryStorage({}),
      sessionStorage: createMemoryStorage({}),
      indexedDB
    })

    await bridge.manageStorage({
      event: 'evt-1',
      pageId: 'page-1',
      origin: 'https://app.example',
      action: 'set',
      scope: 'indexedDB',
      databaseName: 'app-db',
      objectStoreName: 'todos',
      key: '1',
      value: '{"title":"Ship it"}'
    })

    await expect(
      bridge.manageStorage({
        event: 'evt-2',
        pageId: 'page-1',
        origin: 'https://app.example',
        action: 'get',
        scope: 'indexedDB',
        databaseName: 'app-db',
        objectStoreName: 'todos',
        key: '1'
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        key: '1',
        value: { title: 'Ship it' }
      }
    })
  })
})

function createMemoryStorage(initial: Record<string, string>): Storage {
  const entries = new Map(Object.entries(initial))

  return {
    get length() {
      return entries.size
    },
    key(index: number) {
      return [...entries.keys()][index] ?? null
    },
    getItem(name: string) {
      return entries.get(name) ?? null
    },
    setItem(name: string, value: string) {
      entries.set(name, value)
    },
    removeItem(name: string) {
      entries.delete(name)
    },
    clear() {
      entries.clear()
    }
  }
}

function createMemoryIndexedDb(): {
  readonly stores: Map<string, Map<string, unknown>>
  databases(): Promise<Array<{ name: string; version: number }>>
} {
  const stores = new Map<string, Map<string, unknown>>()

  return {
    stores,
    databases: () => Promise.resolve([{ name: 'app-db', version: 1 }])
  }
}

function createMemoryCookieAccess(): {
  get(): string
  set(value: string): void
} {
  const cookies = new Map<string, string>()

  return {
    get: () =>
      [...cookies.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join('; '),
    set(value) {
      const [pair, ...attributes] = value.split(';').map((item) => item.trim())
      const [name, cookieValue = ''] = pair.split('=')
      const shouldDelete = attributes.some((item) =>
        item.toLowerCase().startsWith('max-age=0')
      )

      if (shouldDelete) {
        cookies.delete(decodeURIComponent(name))
        return
      }

      cookies.set(decodeURIComponent(name), decodeURIComponent(cookieValue))
    }
  }
}
