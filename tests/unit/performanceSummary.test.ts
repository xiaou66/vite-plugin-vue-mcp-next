import { describe, expect, it } from 'vitest'
import { buildPerformanceSummary } from '../../src/performance/summary'

describe('buildPerformanceSummary', () => {
  it('marks long-task bursts as suspected jank', () => {
    const summary = buildPerformanceSummary({
      longTasks: [
        { startTime: 0, durationMs: 120, source: 'longtask' },
        { startTime: 200, durationMs: 80, source: 'event-loop-lag' }
      ],
      memorySamples: [
        { timestamp: 0, usedJSHeapSize: 10 },
        { timestamp: 1, usedJSHeapSize: 30 }
      ]
    })

    expect(summary.longTaskCount).toBe(2)
    expect(summary.suspectedJank).toBe(true)
    expect(summary.severity).toBe('warning')
    expect(summary.blockedTimeMs).toBe(100)
  })
})
