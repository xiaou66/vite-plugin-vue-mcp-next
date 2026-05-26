import { describe, expect, it } from 'vitest'
import {
  inspectConsoleArg,
  registerConsoleArg
} from '../../src/runtime/consoleArgRegistry'

describe('console arg registry', () => {
  it('keeps object registration lazy and inspects only on demand', () => {
    let ownKeysCount = 0
    const value = new Proxy(
      { count: 1 },
      {
        ownKeys(target) {
          ownKeysCount++
          return Reflect.ownKeys(target)
        }
      }
    )

    const reference = registerConsoleArg(value)

    expect(ownKeysCount).toBe(0)
    expect(reference.argId).toMatch(/^console-arg-/)
    expect(reference.label).toBe(`[Object:${reference.argId}]`)

    const result = inspectConsoleArg({ argId: reference.argId })

    expect(ownKeysCount).toBe(1)
    expect(result).toMatchObject({
      ok: true,
      argId: reference.argId,
      preview: { count: 1 }
    })
  })

  it('returns a structured error for missing references', () => {
    expect(inspectConsoleArg({ argId: 'console-arg-missing' })).toEqual({
      ok: false,
      argId: 'console-arg-missing',
      error: 'Console object reference not found or expired'
    })
  })
})
