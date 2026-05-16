import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installNetworkHook } from '../../src/runtime/networkHook'
import type { NetworkRecord } from '../../src/types'

const originalWindow = globalThis.window

describe('network hook', () => {
  beforeEach(() => {
    Object.assign(globalThis, {
      window: {
        fetch: vi.fn(() =>
          Promise.resolve(
            new Response(JSON.stringify({ ok: true }), { status: 201 })
          )
        )
      }
    })
  })

  afterEach(() => {
    Object.assign(globalThis, { window: originalWindow })
    vi.restoreAllMocks()
  })

  it('captures fetch request and response records without consuming the response', async () => {
    const records: NetworkRecord[] = []
    const restore = installNetworkHook({
      pageId: 'runtime-1',
      maxBodySize: 1000,
      maskHeaders: ['authorization'],
      send(record) {
        records.push(record)
      }
    })

    const response = await window.fetch('http://localhost/api?a=1', {
      method: 'POST',
      headers: { authorization: 'secret' },
      body: JSON.stringify({ name: 'demo' })
    })
    restore()

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ ok: true })
    expect(records.at(-1)).toEqual(
      expect.objectContaining({
        pageId: 'runtime-1',
        method: 'POST',
        status: 201,
        responseBody: '{"ok":true}'
      })
    )
  })
})
