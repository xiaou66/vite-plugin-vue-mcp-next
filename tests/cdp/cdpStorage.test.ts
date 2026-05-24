import { describe, expect, it, vi } from 'vitest'
import { createCdpStorageAdapter } from '../../src/cdp/cdpStorage'

describe('createCdpStorageAdapter', () => {
  it('skips HttpOnly cookies when deleting and uses IndexedDB protocol calls', async () => {
    const client = {
      Storage: {
        getCookies: vi.fn().mockResolvedValue({
          cookies: [
            {
              name: 'sid',
              value: '1',
              domain: 'app.example',
              path: '/',
              httpOnly: true
            },
            {
              name: 'pref',
              value: 'dark',
              domain: 'app.example',
              path: '/',
              httpOnly: false
            }
          ]
        }),
        setCookies: vi.fn().mockResolvedValue(undefined)
      },
      Network: {
        deleteCookies: vi.fn().mockResolvedValue(undefined)
      },
      IndexedDB: {
        requestDatabaseNames: vi
          .fn()
          .mockResolvedValue({ databaseNames: ['app-db'] }),
        requestDatabase: vi.fn().mockResolvedValue({
          databaseWithObjectStores: {
            name: 'app-db',
            version: 1,
            objectStores: [{ name: 'todos', indexes: [] }]
          }
        }),
        requestData: vi.fn().mockResolvedValue({
          objectStoreDataEntries: [],
          hasMore: false
        }),
        deleteDatabase: vi.fn().mockResolvedValue(undefined),
        clearObjectStore: vi.fn().mockResolvedValue(undefined),
        deleteObjectStoreEntries: vi.fn().mockResolvedValue(undefined),
        getMetadata: vi
          .fn()
          .mockResolvedValue({ entriesCount: 0, keyGeneratorValue: 1 })
      }
    }

    const adapter = createCdpStorageAdapter(client as never)
    const result = await adapter.manageStorage({
      event: 'evt-1',
      pageId: 'page-1',
      origin: 'https://app.example',
      action: 'clear',
      scope: 'cookie'
    })

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({
      deletedCount: 1,
      skippedHttpOnlyCount: 1
    })
    expect(client.Network.deleteCookies).toHaveBeenCalledTimes(1)

    await adapter.manageStorage({
      event: 'evt-2',
      pageId: 'page-1',
      origin: 'https://app.example',
      action: 'list',
      scope: 'indexedDB'
    })

    expect(client.IndexedDB.requestDatabaseNames).toHaveBeenCalledWith({
      securityOrigin: 'https://app.example'
    })
  })
})
