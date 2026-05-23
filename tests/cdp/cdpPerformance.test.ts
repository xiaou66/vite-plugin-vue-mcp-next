import { readFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  recordCdpPerformance,
  takeHeapSnapshot
} from '../../src/cdp/cdpPerformance'

describe('recordCdpPerformance', () => {
  it('collects performance metrics and aggregates cpu profile hotspots', async () => {
    vi.useFakeTimers()
    try {
      const client = createPerformanceClient()
      const reportPromise = recordCdpPerformance({
        client: client as never,
        pageId: 'cdp-test',
        durationMs: 1000,
        includeMemory: true,
        includeStacks: true
      })

      await vi.advanceTimersByTimeAsync(1000)
      const report = await reportPromise

      expect(report.source).toBe('cdp')
      expect(report.summary.suspectedJank).toBe(true)
      expect(report.summary.longTaskCount).toBe(1)
      expect(report.memory?.initialUsedJSHeapSize).toBe(123)
      expect(report.stacks?.topFrames[0]?.functionName).toBe('hotFn')
      expect(client.Profiler.start).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('takeHeapSnapshot', () => {
  it('writes a heap snapshot artifact instead of returning the raw payload', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vue-mcp-heap-'))
    const client = createHeapSnapshotClient()

    const artifact = await takeHeapSnapshot({
      client: client as never,
      pageId: 'cdp-test',
      saveDir: path.join(root, '.vite-mcp/performance')
    })

    expect(artifact.kind).toBe('heap-snapshot')
    expect(artifact.path).toContain(path.join(root, '.vite-mcp/performance'))
    await expect(readFile(artifact.path, 'utf8')).resolves.toContain(
      '"chunks":2'
    )
  })
})

function createPerformanceClient() {
  const listeners: {
    chunk?: (payload: { chunk?: string }) => void
    finished?: () => void
  } = {}

  return {
    Performance: {
      enable: vi.fn(() => Promise.resolve(undefined)),
      getMetrics: vi.fn(() =>
        Promise.resolve({
          metrics: [
            { name: 'TaskDuration', value: 456 },
            { name: 'JSHeapUsedSize', value: 123 },
            { name: 'JSHeapTotalSize', value: 456 },
            { name: 'JSHeapSizeLimit', value: 789 }
          ]
        })
      )
    },
    Profiler: {
      enable: vi.fn(() => Promise.resolve(undefined)),
      start: vi.fn(() => Promise.resolve(undefined)),
      stop: vi.fn(() =>
        Promise.resolve({
          profile: {
            nodes: [
              {
                id: 1,
                callFrame: {
                  functionName: 'hotFn',
                  url: 'src/app.ts',
                  lineNumber: 1,
                  columnNumber: 1
                },
                hitCount: 3
              }
            ],
            samples: [1, 1, 1],
            timeDeltas: [10, 10, 10]
          }
        })
      )
    },
    HeapProfiler: {
      enable: vi.fn(() => Promise.resolve(undefined)),
      addHeapSnapshotChunk: vi.fn((handler: (payload: { chunk?: string }) => void) => {
        listeners.chunk = handler
      }),
      heapSnapshotFinished: vi.fn((handler: () => void) => {
        listeners.finished = handler
      }),
      takeHeapSnapshot: vi.fn(() =>
        Promise.resolve().then(() => {
          if (listeners.chunk) {
            listeners.chunk({ chunk: '{"chunks":' })
            listeners.chunk({ chunk: '2' })
            listeners.chunk({ chunk: '}' })
          }
          if (listeners.finished) {
            listeners.finished()
          }
        })
      )
    }
  }
}

function createHeapSnapshotClient() {
  const listeners: {
    chunk?: (payload: { chunk?: string }) => void
  } = {}

  return {
    HeapProfiler: {
      enable: vi.fn(() => Promise.resolve(undefined)),
      addHeapSnapshotChunk: vi.fn((handler: (payload: { chunk?: string }) => void) => {
        listeners.chunk = handler
      }),
      takeHeapSnapshot: vi.fn(() =>
        Promise.resolve().then(() => {
          if (listeners.chunk) {
            listeners.chunk({ chunk: '{"chunks":' })
            listeners.chunk({ chunk: '2' })
            listeners.chunk({ chunk: '}' })
          }
        })
      )
    }
  }
}
