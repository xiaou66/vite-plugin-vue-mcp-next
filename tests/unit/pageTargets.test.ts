import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS } from '../../src/constants'
import { createVueMcpNextContext } from '../../src/context'

describe('PageTargetRegistry', () => {
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
})
