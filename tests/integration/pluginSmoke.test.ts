import { describe, expect, it } from 'vitest'
import { vueMcpNext } from '../../src'

describe('vueMcpNext plugin shell', () => {
  it('creates a serve-only Vite plugin with expected hooks', () => {
    const plugin = vueMcpNext()

    expect(plugin.name).toBe('vite-plugin-vue-mcp-next')
    expect(plugin.apply).toBe('serve')
    expect(plugin.enforce).toBe('pre')
    expect(typeof plugin.configureServer).toBe('function')
    expect(typeof plugin.transformIndexHtml).toBe('function')
    expect(typeof plugin.resolveId).toBe('function')
    expect(typeof plugin.load).toBe('function')
  })
})
