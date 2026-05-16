import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS } from '../../src/constants'
import { shouldUseCdp } from '../../src/mcp/routeTools'

describe('MCP tool routing', () => {
  it('uses CDP when mode is auto and a matched CDP target exists', () => {
    expect(
      shouldUseCdp({
        options: {
          ...DEFAULT_OPTIONS,
          cdp: { browserUrl: 'http://127.0.0.1:9222' }
        },
        hasMatchedCdpTarget: true,
        capabilityMode: 'auto'
      })
    ).toBe(true)
  })

  it('falls back to Hook when CDP target is unavailable in auto mode', () => {
    expect(
      shouldUseCdp({
        options: DEFAULT_OPTIONS,
        hasMatchedCdpTarget: false,
        capabilityMode: 'auto'
      })
    ).toBe(false)
  })

  it('does not use CDP when capability mode is hook', () => {
    expect(
      shouldUseCdp({
        options: {
          ...DEFAULT_OPTIONS,
          cdp: { browserUrl: 'http://127.0.0.1:9222' }
        },
        hasMatchedCdpTarget: true,
        capabilityMode: 'hook'
      })
    ).toBe(false)
  })
})
