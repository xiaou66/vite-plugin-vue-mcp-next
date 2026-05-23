import { describe, expect, it } from 'vitest'
import { resolvePerformanceTransport } from '../../src/performance/routing'

describe('resolvePerformanceTransport', () => {
  it('uses CDP in auto mode when a CDP target exists', () => {
    expect(
      resolvePerformanceTransport({
        mode: 'auto',
        hasCdpTarget: true,
        hasCdpEndpoint: true
      })
    ).toBe('cdp')
  })

  it('falls back to hook in auto mode when no CDP target exists', () => {
    expect(
      resolvePerformanceTransport({
        mode: 'auto',
        hasCdpTarget: false,
        hasCdpEndpoint: false
      })
    ).toBe('hook')
  })

  it('keeps hook mode on the runtime path even when CDP is available', () => {
    expect(
      resolvePerformanceTransport({
        mode: 'hook',
        hasCdpTarget: true,
        hasCdpEndpoint: true
      })
    ).toBe('hook')
  })

  it('disables performance diagnostics in off mode', () => {
    expect(
      resolvePerformanceTransport({
        mode: 'off',
        hasCdpTarget: true,
        hasCdpEndpoint: true
      })
    ).toBe('off')
  })
})
