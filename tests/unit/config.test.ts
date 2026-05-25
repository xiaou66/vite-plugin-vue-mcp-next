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
      serverName: 'vite-mcp-next'
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

  it('keeps MCP client config targets enabled for auto detection by default', () => {
    const options = mergeOptions()

    expect(options.mcpClients).toEqual({
      cursor: true,
      codex: true,
      claudeCode: true,
      trae: true,
      serverName: 'vite-mcp-next'
    })
  })

  it('enables AI skill auto config by default', () => {
    const options = mergeOptions()

    expect(options.skill).toEqual({
      autoConfig: true
    })
  })

  it('allows disabling AI skill auto config', () => {
    const options = mergeOptions({
      skill: {
        autoConfig: false
      }
    })

    expect(options.skill).toEqual({
      autoConfig: false
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

  it('merges performance defaults', () => {
    const options = mergeOptions()

    expect(options.performance).toEqual({
      mode: 'auto',
      maxDurationMs: 30000,
      sampleIntervalMs: 250,
      longTaskThresholdMs: 50,
      saveDir: '.vite-mcp/performance',
      memory: {
        enabled: true
      },
      stacks: {
        enabled: true
      }
    })
  })

  it('keeps performance output routing configurable', () => {
    const options = mergeOptions({
      performance: {
        mode: 'hook',
        saveDir: 'custom-performance'
      }
    })

    expect(options.performance.mode).toBe('hook')
    expect(options.performance.saveDir).toBe('custom-performance')
    expect(options.performance.memory).toEqual({
      enabled: true
    })
    expect(options.performance.stacks).toEqual({
      enabled: true
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

  it('enables element picker with Option/Alt + Shift by default', () => {
    const options = mergeOptions()

    expect(options.elementPicker).toEqual({
      enabled: true,
      shortcut: {
        altKey: true,
        shiftKey: true,
        metaKey: false,
        ctrlKey: false
      },
      toastDurationMs: 2200
    })
  })

  it('merges element picker options without losing shortcut defaults', () => {
    const options = mergeOptions({
      elementPicker: {
        toastDurationMs: 3000,
        shortcut: {
          metaKey: true,
          altKey: false
        }
      }
    })

    expect(options.elementPicker).toEqual({
      enabled: true,
      shortcut: {
        altKey: false,
        shiftKey: true,
        metaKey: true,
        ctrlKey: false
      },
      toastDurationMs: 3000
    })
  })
})
