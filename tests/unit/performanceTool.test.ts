import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS } from '../../src/constants'
import { createVueMcpNextContext } from '../../src/context'
import { registerPerformanceTools } from '../../src/mcp/tools/performance'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

describe('registerPerformanceTools', () => {
  it('returns a runtime report when CDP is unavailable', async () => {
    const server = createServer()
    const ctx = createContext()

    registerPerformanceTools(
      server as unknown as McpServer,
      ctx
    )
    const result = await server.tools.record_performance({
      durationMs: 100,
      includeMemory: true,
      includeStacks: true
    })

    expect(result.structuredContent.ok).not.toBe(false)
    expect(result.structuredContent.source).toBe('hook')
    expect(result.structuredContent.limitations).toBeDefined()
  })

  it('falls back to runtime report when CDP endpoint is unreachable in auto mode', async () => {
    const server = createServer()
    const ctx = createContext({
      ...DEFAULT_OPTIONS,
      cdp: {
        ...DEFAULT_OPTIONS.cdp,
        browserUrl: 'http://127.0.0.1:9'
      }
    })

    ctx.pages.upsert({
      pageId: 'runtime-page',
      source: 'runtime',
      url: 'http://localhost:3456/playground/index.html',
      pathname: '/playground/index.html',
      connected: true
    })

    registerPerformanceTools(
      server as unknown as McpServer,
      ctx
    )
    const result = await server.tools.record_performance({
      pageId: 'runtime-page',
      durationMs: 100,
      includeMemory: true,
      includeStacks: true
    })

    expect(result.structuredContent.ok).not.toBe(false)
    expect(result.structuredContent.source).toBe('hook')
  })

  it('returns an explicit error for heap snapshots without CDP', async () => {
    const server = createServer()
    const ctx = createContext({
      ...DEFAULT_OPTIONS,
      performance: {
        ...DEFAULT_OPTIONS.performance,
        mode: 'hook'
      }
    })

    registerPerformanceTools(
      server as unknown as McpServer,
      ctx
    )
    const result = await server.tools.take_heap_snapshot({
      pageId: 'runtime-page'
    })

    expect(result.structuredContent.ok).toBe(false)
    expect(result.structuredContent.error).toContain('disabled')
  })
})

function createServer() {
  const tools: Record<string, (input: unknown) => Promise<ToolResult>> = {}

  return {
    tools,
    registerTool(
      name: string,
      _config: unknown,
      handler: (input: unknown) => Promise<ToolResult>
    ) {
      tools[name] = handler
    }
  }
}

function createContext(options = DEFAULT_OPTIONS) {
  const ctx = createVueMcpNextContext(options)
  let callback: ((data: unknown) => void) | undefined

  ctx.rpcServer = {
    recordPerformance() {
      callback?.({
        recordingId: 'runtime-recording',
        pageId: 'runtime-page',
        source: 'hook',
        startedAt: 0,
        endedAt: 100,
        durationMs: 100,
        summary: {
          blockedTimeMs: 0,
          longTaskCount: 0,
          maxTaskDurationMs: 0,
          suspectedJank: false,
          severity: 'ok'
        },
        longTasks: [],
        limitations: ['runtime-only']
      })
    },
    onPerformanceRecorded: vi.fn(),
    startPerformanceRecording: vi.fn(),
    onPerformanceRecordingStarted: vi.fn(),
    stopPerformanceRecording: vi.fn(),
    onPerformanceRecordingStopped: vi.fn()
  } as never

  ctx.hooks.hookOnce = (event: string, handler: (data: unknown) => void) => {
    callback = handler
    return () => {}
  }

  return ctx
}

interface ToolResult {
  readonly structuredContent: {
    readonly ok?: boolean
    readonly error?: string
    readonly source?: string
    readonly limitations?: string[]
    readonly [key: string]: unknown
  }
}
