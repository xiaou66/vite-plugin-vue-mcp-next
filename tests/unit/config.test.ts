import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS, mergeOptions } from '../../src/constants'

describe('runtime DevTools options', () => {
  it('uses safe defaults for MCP, runtime, network, DOM, and console', () => {
    const options = mergeOptions()

    expect(options.mcpPath).toBe('/__mcp')
    expect(options.host).toBe('localhost')
    expect(options.printUrl).toBe(true)
    expect(options.updateCursorMcpJson).toEqual({
      enabled: true,
      serverName: 'vue-mcp-next'
    })
    expect(options.runtime.mode).toBe('auto')
    expect(options.runtime.evaluate.enabled).toBe(false)
    expect(options.network.mode).toBe('auto')
    expect(options.network.maxRecords).toBe(500)
    expect(options.dom.maxDepth).toBe(8)
    expect(options.console.maxRecords).toBe(1000)
  })

  it('deep merges nested options without losing safe defaults', () => {
    const options = mergeOptions({
      runtime: { evaluate: { enabled: true } },
      network: { maxRecords: 10 },
      cdp: { browserUrl: 'http://127.0.0.1:9222' }
    })

    expect(options.runtime.mode).toBe(DEFAULT_OPTIONS.runtime.mode)
    expect(options.runtime.evaluate.enabled).toBe(true)
    expect(options.runtime.evaluate.timeoutMs).toBe(3000)
    expect(options.network.mode).toBe('auto')
    expect(options.network.maxRecords).toBe(10)
    expect(options.cdp.browserUrl).toBe('http://127.0.0.1:9222')
  })
})
