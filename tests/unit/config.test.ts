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

  it('enables all MCP client config targets by default', () => {
    const options = mergeOptions()

    expect(options.mcpClients).toEqual({
      cursor: true,
      codex: true,
      claudeCode: true,
      trae: true,
      serverName: 'vue-mcp-next'
    })
  })

  it('merges screenshot defaults', () => {
    const options = mergeOptions()

    expect(options.screenshot).toEqual({
      type: 'path',
      saveDir: '.vite-mcp/screenshot',
      prefer: 'auto',
      maxBytes: 5 * 1024 * 1024,
      snapdom: {
        options: {},
        plugins: []
      }
    })
  })

  it('merges snapdom options and Vite import path plugins', () => {
    const options = mergeOptions({
      screenshot: {
        prefer: 'runtime',
        maxBytes: 1024,
        snapdom: {
          options: {
            scale: 2,
            useProxy: 'http://localhost:3000/proxy?url=',
            exclude: ['[data-no-screenshot]']
          },
          plugins: [
            '/src/screenshot/watermark.ts',
            {
              path: '@/screenshot/mask-sensitive',
              exportName: 'createMaskPlugin',
              options: { selectors: ['.token'] }
            }
          ],
          filter: '/src/screenshot/filter.ts',
          fallbackURL: '/src/screenshot/fallback-url.ts'
        }
      }
    })

    expect(options.screenshot.prefer).toBe('runtime')
    expect(options.screenshot.maxBytes).toBe(1024)
    expect(options.screenshot.snapdom.options).toEqual({
      scale: 2,
      useProxy: 'http://localhost:3000/proxy?url=',
      exclude: ['[data-no-screenshot]']
    })
    expect(options.screenshot.snapdom.plugins).toHaveLength(2)
    expect(options.screenshot.snapdom.filter).toBe('/src/screenshot/filter.ts')
    expect(options.screenshot.snapdom.fallbackURL).toBe(
      '/src/screenshot/fallback-url.ts'
    )
  })

  it('keeps screenshot output mode as project-level configuration', () => {
    const options = mergeOptions({
      screenshot: {
        type: 'base64',
        saveDir: 'custom-screenshots'
      }
    })

    expect(options.screenshot.type).toBe('base64')
    expect(options.screenshot.saveDir).toBe('custom-screenshots')
    expect(options.screenshot.prefer).toBe('auto')
    expect(options.screenshot.snapdom).toEqual({
      options: {},
      plugins: []
    })
  })

  it('maps legacy cursor config into MCP client config', () => {
    const options = mergeOptions({
      updateCursorMcpJson: {
        enabled: false,
        serverName: 'custom-vue-mcp'
      }
    })

    expect(options.updateCursorMcpJson).toEqual({
      enabled: false,
      serverName: 'custom-vue-mcp'
    })
    expect(options.mcpClients).toEqual({
      cursor: false,
      codex: true,
      claudeCode: true,
      trae: true,
      serverName: 'custom-vue-mcp'
    })
  })

  it('lets mcpClients override legacy cursor defaults when both are set', () => {
    const options = mergeOptions({
      updateCursorMcpJson: true,
      mcpClients: {
        cursor: false,
        codex: false,
        claudeCode: true,
        trae: true,
        serverName: 'manual-name'
      }
    })

    expect(options.mcpClients).toEqual({
      cursor: false,
      codex: false,
      claudeCode: true,
      trae: true,
      serverName: 'manual-name'
    })
  })
})
