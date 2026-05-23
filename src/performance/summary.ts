/**
 * 性能报告摘要计算。
 *
 * 这个文件只保留纯数据归纳逻辑，不依赖浏览器 API 或 CDP client，便于 runtime 和 CDP 两条路径共享同一口径。
 */
import { DEFAULT_PERFORMANCE_LONG_TASK_THRESHOLD_MS } from '../constants'
import type {
  LongTaskRecord,
  MemorySample,
  MemorySummary,
  PerformanceSummary,
  StackFrameSummary,
  StackSummary
} from '../types'

/**
 * 计算性能摘要。
 *
 * 该摘要面向快速判断页面是否明显卡顿，不追求把所有原始信号都塞进结果里。
 */
export function buildPerformanceSummary(input: {
  longTasks: LongTaskRecord[]
  memorySamples: MemorySample[]
}): PerformanceSummary {
  const memory = buildMemorySummary(input.memorySamples)
  const blockedTimeMs = input.longTasks.reduce((total, task) => {
    return (
      total +
      Math.max(0, task.durationMs - DEFAULT_PERFORMANCE_LONG_TASK_THRESHOLD_MS)
    )
  }, 0)
  const longTaskCount = input.longTasks.length
  const durations = input.longTasks.map((task) => task.durationMs)
  const maxTaskDurationMs = durations.length ? Math.max(...durations) : 0
  const averageTaskDurationMs = durations.length
    ? Math.round(
        durations.reduce((total, duration) => total + duration, 0) /
          durations.length
      )
    : undefined
  const suspectedJank =
    blockedTimeMs > 0 || memory.trend === 'growing' || longTaskCount > 0
  const severity = resolveSeverity({
    blockedTimeMs,
    longTaskCount,
    memoryTrend: memory.trend
  })

  return {
    blockedTimeMs,
    longTaskCount,
    maxTaskDurationMs,
    averageTaskDurationMs,
    suspectedJank,
    severity
  }
}

/**
 * 计算内存趋势。
 *
 * 只比较首尾和峰值，不推断对象引用关系，这样 runtime-only 路径也能给出稳定结论。
 */
export function buildMemorySummary(samples: MemorySample[]): MemorySummary {
  const first = samples[0]?.usedJSHeapSize
  const last = samples.at(-1)?.usedJSHeapSize
  const peak = samples.reduce((currentPeak, sample) => {
    if (typeof sample.usedJSHeapSize !== 'number') {
      return currentPeak
    }

    return Math.max(currentPeak, sample.usedJSHeapSize)
  }, 0)

  const trend = resolveMemoryTrend(first, last)

  return {
    samples,
    initialUsedJSHeapSize: first,
    finalUsedJSHeapSize: last,
    peakUsedJSHeapSize: peak || undefined,
    deltaUsedJSHeapSize:
      typeof first === 'number' && typeof last === 'number'
        ? last - first
        : undefined,
    trend
  }
}

/**
 * 计算堆栈摘要。
 *
 * 该函数只做排序和裁剪，不直接理解 CPU profile 或错误对象，方便 CDP 和 runtime 传入不同来源的帧数据。
 */
export function buildStackSummary(
  frames: StackFrameSummary[],
  options: { rawProfilePath?: string; limitation?: string } = {}
): StackSummary {
  return {
    topFrames: [...frames].sort(sortByHotness).slice(0, 10),
    rawProfilePath: options.rawProfilePath,
    limitation: options.limitation
  }
}

/**
 * 根据卡顿指标判断严重程度。
 *
 * 这个分级只用于调试报告的阅读提示，不代表生产级告警阈值。
 */
function resolveSeverity(input: {
  blockedTimeMs: number
  longTaskCount: number
  memoryTrend: MemorySummary['trend']
}): PerformanceSummary['severity'] {
  if (input.blockedTimeMs >= 1000 || input.longTaskCount >= 10) {
    return 'critical'
  }

  if (input.blockedTimeMs > 0 || input.memoryTrend === 'growing') {
    return 'warning'
  }

  return 'ok'
}

/**
 * 根据首尾内存采样判断趋势。
 *
 * 只要存在明显上升就视为 growing，避免 runtime 路径因单次抖动而过度乐观。
 */
function resolveMemoryTrend(
  first: number | undefined,
  last: number | undefined
): MemorySummary['trend'] {
  if (typeof first !== 'number' || typeof last !== 'number') {
    return 'unknown'
  }

  if (last > first) {
    return 'growing'
  }

  return 'stable'
}

/**
 * 按热点程度给堆栈帧排序。
 *
 * 优先比较总耗时，再比较自身耗时和命中次数，保证摘要更偏向真正的热点函数。
 */
function sortByHotness(
  left: StackFrameSummary,
  right: StackFrameSummary
): number {
  return compareNumber(right.totalTimeMs, left.totalTimeMs)
    || compareNumber(right.selfTimeMs, left.selfTimeMs)
    || compareNumber(right.hitCount, left.hitCount)
}

/**
 * 比较可选数值。
 *
 * 空值统一排后，方便摘要维持稳定排序。
 */
function compareNumber(left?: number, right?: number): number {
  return (left ?? -1) - (right ?? -1)
}
