import { describe, expect, it } from 'vitest'
import {
  createRuntimeElementId,
  createRuntimeElementRegistry
} from '../../src/runtime/elementRegistry'

describe('runtime element registry', () => {
  it('creates runtime ids with the expected prefix', () => {
    expect(createRuntimeElementId()).toMatch(/^runtime:vmcp_[A-Za-z0-9_-]+$/)
  })

  it('stores and resolves element snapshots for the current page lifecycle', () => {
    const registry = createRuntimeElementRegistry()
    const element = { tagName: 'BUTTON' } as Element
    const elementId = registry.register(element)

    expect(registry.get(elementId)?.element).toBe(element)
    registry.clear()
    expect(registry.get(elementId)).toBeUndefined()
  })
})
