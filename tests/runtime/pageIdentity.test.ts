import { describe, expect, it } from 'vitest'
import {
  createRuntimePageId,
  getRuntimePageIdentity
} from '../../src/runtime/pageIdentity'

describe('runtime page identity', () => {
  it('creates stable page id prefix for runtime targets', () => {
    expect(createRuntimePageId()).toMatch(/^runtime-/)
  })

  it('builds page identity from window-like input', () => {
    const identity = getRuntimePageIdentity({
      href: 'http://localhost:5173/admin.html?x=1',
      title: 'Admin',
      innerWidth: 1200,
      innerHeight: 800,
      readyState: 'complete'
    })

    expect(identity.pathname).toBe('/admin.html')
    expect(identity.title).toBe('Admin')
    expect(identity.viewport).toEqual({ width: 1200, height: 800 })
    expect(identity.readyState).toBe('complete')
  })
})
