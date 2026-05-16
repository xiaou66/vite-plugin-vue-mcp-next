import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS } from '../../src/constants'
import { assertEvaluateEnabled } from '../../src/mcp/tools/evaluate'

describe('evaluate policy', () => {
  it('blocks script evaluation by default', () => {
    expect(() => {
      assertEvaluateEnabled(DEFAULT_OPTIONS)
    }).toThrow('evaluate_script is disabled')
  })

  it('allows script evaluation when explicitly enabled', () => {
    expect(() => {
      assertEvaluateEnabled({
        ...DEFAULT_OPTIONS,
        runtime: {
          ...DEFAULT_OPTIONS.runtime,
          evaluate: { enabled: true, timeoutMs: 3000 }
        }
      })
    }).not.toThrow()
  })
})
