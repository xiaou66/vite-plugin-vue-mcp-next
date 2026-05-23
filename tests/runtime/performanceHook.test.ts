import { describe, expect, it, vi } from 'vitest'
import { createPerformanceCollector } from '../../src/runtime/performanceHook'

describe('createPerformanceCollector', () => {
  it('summarizes long tasks and memory growth from runtime signals', async () => {
    vi.useFakeTimers()
    try {
      const memorySamples = [
        {
          timestamp: 0,
          usedJSHeapSize: 10,
          totalJSHeapSize: 20,
          jsHeapSizeLimit: 100
        },
        {
          timestamp: 1,
          usedJSHeapSize: 30,
          totalJSHeapSize: 40,
          jsHeapSizeLimit: 100
        }
      ]
      let memoryIndex = 0

      const collector = createPerformanceCollector({
        pageId: 'runtime-test',
        now: (() => {
          let current = 0

          return () => {
            current += 100

            return current
          }
        })(),
        readMemory: () => memorySamples[memoryIndex++] ?? memorySamples.at(-1),
        observeLongTask: (push) => {
          const timer = setTimeout(() => {
            push({ startTime: 0, durationMs: 120, source: 'longtask' })
          }, 100)

          return () => {
            clearTimeout(timer)
          }
        },
        observeAnimationFrame: (push) => {
          const timer = setTimeout(() => {
            push({
              startTime: 50,
              durationMs: 60,
              source: 'long-animation-frame'
            })
          }, 200)

          return () => {
            clearTimeout(timer)
          }
        },
        setTimeout,
        clearTimeout
      })

      const reportPromise = collector.recordOnce({
        durationMs: 1000,
        includeMemory: true,
        includeStacks: false
      })

      await vi.advanceTimersByTimeAsync(1000)
      const report = await reportPromise

      expect(report.pageId).toBe('runtime-test')
      expect(report.source).toBe('hook')
      expect(report.summary.longTaskCount).toBe(2)
      expect(report.summary.suspectedJank).toBe(true)
      expect(report.memory?.trend).toBe('growing')
    } finally {
      vi.useRealTimers()
    }
  })
})
