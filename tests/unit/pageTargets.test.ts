import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS } from '../../src/constants'
import { createVueMcpNextContext } from '../../src/context'

describe('PageTargetRegistry', () => {
  it('removes disconnected runtime targets after retention time', () => {
    const now = 1_000_000
    const ctx = createVueMcpNextContext(DEFAULT_OPTIONS)

    ctx.pages.upsert({
      pageId: 'runtime-old',
      source: 'runtime',
      url: 'http://localhost:5173/old.html',
      pathname: '/old.html',
      connected: true
    }, now)
    ctx.pages.disconnect('runtime-old', now)

    expect(ctx.pages.list({ now: now + 299_999, includeDisconnected: true }))
      .toHaveLength(1)
    expect(ctx.pages.list({ now: now + 300_001, includeDisconnected: true }))
      .toHaveLength(0)
  })

  it('registers and lists runtime targets', () => {
    const ctx = createVueMcpNextContext(DEFAULT_OPTIONS)

    ctx.pages.upsert({
      pageId: 'runtime-1',
      source: 'runtime',
      url: 'http://localhost:5173/admin.html',
      pathname: '/admin.html',
      title: 'Admin',
      entry: '/admin.html',
      connected: true
    })

    expect(ctx.pages.list()).toHaveLength(1)
    expect(ctx.pages.get('runtime-1')?.title).toBe('Admin')
  })

  it('marks targets as disconnected instead of deleting immediately', () => {
    const ctx = createVueMcpNextContext(DEFAULT_OPTIONS)

    ctx.pages.upsert({
      pageId: 'runtime-1',
      source: 'runtime',
      url: 'http://localhost:5173/',
      pathname: '/',
      connected: true
    })
    ctx.pages.disconnect('runtime-1')

    expect(ctx.pages.get('runtime-1')?.connected).toBe(false)
  })

  it('disconnects old runtime target when the same tab reconnects', () => {
    const ctx = createVueMcpNextContext(DEFAULT_OPTIONS)

    ctx.pages.upsert({
      pageId: 'runtime-old',
      runtimeClientId: 'runtime-client-1',
      source: 'runtime',
      url: 'http://localhost:5173/index.html',
      pathname: '/index.html',
      connected: true
    })
    ctx.pages.upsert({
      pageId: 'runtime-new',
      runtimeClientId: 'runtime-client-1',
      source: 'runtime',
      url: 'http://localhost:5173/index.html',
      pathname: '/index.html',
      connected: true
    })

    expect(ctx.pages.get('runtime-old')?.connected).toBe(false)
    expect(ctx.pages.get('runtime-new')?.connected).toBe(true)
  })

  it('keeps same URL runtime targets from different tabs connected', () => {
    const ctx = createVueMcpNextContext(DEFAULT_OPTIONS)

    ctx.pages.upsert({
      pageId: 'runtime-tab-a',
      runtimeClientId: 'runtime-client-a',
      source: 'runtime',
      url: 'http://localhost:5173/index.html',
      pathname: '/index.html',
      connected: true
    })
    ctx.pages.upsert({
      pageId: 'runtime-tab-b',
      runtimeClientId: 'runtime-client-b',
      source: 'runtime',
      url: 'http://localhost:5173/index.html',
      pathname: '/index.html',
      connected: true
    })

    expect(ctx.pages.get('runtime-tab-a')?.connected).toBe(true)
    expect(ctx.pages.get('runtime-tab-b')?.connected).toBe(true)
  })
})
