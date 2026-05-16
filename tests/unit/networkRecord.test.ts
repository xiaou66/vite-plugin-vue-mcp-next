import { describe, expect, it } from 'vitest'
import { createHookNetworkRecord } from '../../src/runtime/networkHook'

describe('network records', () => {
  it('creates request query from URL', () => {
    const record = createHookNetworkRecord({
      pageId: 'runtime-1',
      url: 'http://localhost/api?a=1',
      method: 'POST',
      requestHeaders: { authorization: 'secret' },
      requestBody: { name: 'demo' },
      maskHeaders: ['authorization'],
      startedAt: 100
    })

    expect(record.requestQuery).toEqual({ a: '1' })
    expect(record.requestHeaders).toEqual({ authorization: '[masked]' })
  })
})
