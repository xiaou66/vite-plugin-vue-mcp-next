import { describe, expect, it, vi } from 'vitest'
import {
  createBoundedPreview,
  safeStringify
} from '../../src/shared/serialization'

describe('bounded serialization preview', () => {
  it('keeps circular values serializable without reading toJSON', () => {
    const toJSON = vi.fn(() => {
      throw new Error('toJSON should not be called')
    })
    const value: {
      name: string
      self?: unknown
      toJSON: () => never
    } = {
      name: 'root',
      toJSON
    }
    value.self = value

    expect(createBoundedPreview(value)).toEqual({
      name: 'root',
      self: '[Circular]'
    })
    expect(toJSON).not.toHaveBeenCalled()
    expect(safeStringify(value)).toBe(
      '{"name":"root","self":"[Circular]"}'
    )
  })

  it('skips birpc-like proxy toJSON properties', () => {
    const target: Record<string, unknown> = { id: 'root', label: 'Root' }
    const value = new Proxy(target, {
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

        return Reflect.get(target, key, receiver) as unknown
      }
    })

    expect(createBoundedPreview(value)).toEqual({
      id: 'root',
      label: 'Root'
    })
  })

  it('enforces depth keys array string and node budgets', () => {
    const value = {
      long: 'x'.repeat(12),
      list: [1, 2, 3],
      nested: { child: { leaf: 'hidden' } },
      a: 1,
      b: 2,
      c: 3
    }

    expect(
      createBoundedPreview(value, {
        maxDepth: 2,
        maxKeys: 3,
        maxArrayItems: 2,
        maxStringLength: 5,
        maxTotalNodes: 10
      })
    ).toEqual({
      long: 'xxxxx[Truncated]',
      list: [1, 2, '[Truncated]'],
      nested: { child: '[Object]' },
      '[Truncated]': '3 keys omitted'
    })
  })

  it('stops traversal when the total node budget is exhausted', () => {
    const value = {
      first: { id: 1 },
      second: { id: 2 },
      third: { id: 3 }
    }

    expect(
      createBoundedPreview(value, {
        maxDepth: 3,
        maxKeys: 10,
        maxArrayItems: 10,
        maxStringLength: 100,
        maxTotalNodes: 2
      })
    ).toEqual({
      first: { id: 1 },
      second: '[Truncated]',
      third: '[Truncated]'
    })
  })
})
