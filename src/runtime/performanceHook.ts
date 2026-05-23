/**
 * 浏览器端性能采集 Hook。
 *
 * 该文件只负责收集运行态可见的长任务、内存趋势和错误堆栈，并把它们整理成统一的性能报告。
 */
import { nanoid } from 'nanoid'
import {
  buildMemorySummary,
  buildPerformanceSummary,
  buildStackSummary
} from '../performance/summary'
import type {
  LongTaskRecord,
  MemorySample,
  PerformanceArtifact,
  PerformanceReport,
  StackFrameSummary
} from '../types'

/**
 * 性能采集器依赖。
 *
 * 通过依赖注入隔离浏览器原生 API，可以让单元测试直接驱动采集逻辑，而不用真的启动浏览器。
 */
export interface PerformanceCollectorDependencies {
  /** 页面 id，用于区分多标签页采样结果。 */
  readonly pageId: string
  /** 时间函数，便于测试固定时间线。 */
  readonly now: () => number
  /** 读取当前内存采样。 */
  readonly readMemory: () => MemorySample | undefined
  /** 安装 longtask 监听器，返回清理函数。 */
  readonly observeLongTask: (push: (task: LongTaskRecord) => void) => () => void
  /** 安装 long-animation-frame 监听器，返回清理函数。 */
  readonly observeAnimationFrame: (
    push: (task: LongTaskRecord) => void
  ) => () => void
  /** 安装 error 监听器，返回清理函数。 */
  readonly observeErrorStack?: (push: (stack: StackFrameSummary) => void) => () => void
  /** 安装 unhandledrejection 监听器，返回清理函数。 */
  readonly observeUnhandledRejectionStack?: (
    push: (stack: StackFrameSummary) => void
  ) => () => void
  /** 等待用 setTimeout。 */
  readonly setTimeout: typeof globalThis.setTimeout
  /** 清理等待用 setTimeout。 */
  readonly clearTimeout: typeof globalThis.clearTimeout
}

/**
 * 性能采集器。
 *
 * 一个页面只维护一个采集器，工具层通过 start/stop 或 recordOnce 控制采集窗口。
 */
export interface PerformanceCollector {
  /** 进行一次定时采集并返回报告。 */
  recordOnce(options: {
    durationMs: number
    includeMemory: boolean
    includeStacks: boolean
  }): Promise<PerformanceReport>
  /** 开始一段交互式采集，返回 recordingId。 */
  start(options: {
    includeMemory: boolean
    includeStacks: boolean
  }): string
  /** 结束交互式采集并返回报告。 */
  stop(recordingId: string): PerformanceReport
  /** 获取最近一次报告。 */
  latest(): PerformanceReport | undefined
  /** 释放监听器。 */
  dispose(): void
}

let activePerformanceCollector: PerformanceCollector | undefined

/**
 * 安装浏览器端性能 Hook。
 *
 * 该函数适用于页面启动阶段，会把真实浏览器 API 绑定到统一的采集器实例上。
 */
export function installPerformanceHook(options: {
  pageId: string
  send?: (report: PerformanceReport) => void
  sampleIntervalMs?: number
  longTaskThresholdMs?: number
}): PerformanceCollector {
  const collector = createPerformanceCollector({
    pageId: options.pageId,
    now: () => Date.now(),
    readMemory: readBrowserMemory,
    observeLongTask: (push) => observeLongTasks(push, options.longTaskThresholdMs),
    observeAnimationFrame: observeAnimationFrameTasks,
    observeErrorStack: observeWindowErrorStack,
    observeUnhandledRejectionStack: observeUnhandledRejectionStack,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window)
  })

  const decoratedCollector = options.send
    ? createDispatchingCollector(collector, options.send)
    : collector

  activePerformanceCollector = decoratedCollector

  return decoratedCollector
}

/**
 * 获取当前页面的性能采集器。
 *
 * RPC 层会在运行时调用这里，避免把采集状态散落在多个模块。
 */
export function getPerformanceCollector(): PerformanceCollector | undefined {
  return activePerformanceCollector
}

/**
 * 创建性能采集器。
 *
 * 采集器只做数据收集和报告聚合，不知道 MCP、CDP 或文件落盘的细节。
 */
export function createPerformanceCollector(
  deps: PerformanceCollectorDependencies
): PerformanceCollector {
  const state: PerformanceCollectorState = {
    longTasks: [],
    stackFrames: [],
    memorySamples: [],
    latestReport: undefined,
    activeRecordingId: undefined,
    activeRecordingStartedAt: 0,
    activeIncludeMemory: true,
    activeIncludeStacks: true
  }

  const cleanups = [
    deps.observeLongTask((task) => {
      state.longTasks.push(task)
    }),
    deps.observeAnimationFrame((task) => {
      state.longTasks.push(task)
    })
  ]

  if (deps.observeErrorStack) {
    cleanups.push(
      deps.observeErrorStack((frame) => {
        state.stackFrames.push(frame)
      })
    )
  }

  if (deps.observeUnhandledRejectionStack) {
    cleanups.push(
      deps.observeUnhandledRejectionStack((frame) => {
        state.stackFrames.push(frame)
      })
    )
  }

  return {
    async recordOnce(options) {
      const recordingId = startSession(state, deps, {
        includeMemory: options.includeMemory,
        includeStacks: options.includeStacks
      })

      await waitForDuration(deps, options.durationMs)

      return stopSession({
        state,
        deps,
        recordingId,
        source: 'hook'
      })
    },
    start(options) {
      if (state.activeRecordingId) {
        throw new Error('A performance recording is already active')
      }

      return startSession(state, deps, options)
    },
    stop(recordingId) {
      return stopSession({
        state,
        deps,
        recordingId,
        source: 'hook'
      })
    },
    latest() {
      return state.latestReport
    },
    dispose() {
      activePerformanceCollector = undefined
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }
}

/**
 * 性能采集器状态。
 */
interface PerformanceCollectorState {
  /** 长任务列表。 */
  longTasks: LongTaskRecord[]
  /** 堆栈列表。 */
  stackFrames: StackFrameSummary[]
  /** 内存采样列表。 */
  memorySamples: MemorySample[]
  /** 最近一次报告。 */
  latestReport?: PerformanceReport
  /** 当前活跃录制 id。 */
  activeRecordingId?: string
  /** 当前录制开始时间。 */
  activeRecordingStartedAt: number
  /** 当前录制是否采集内存。 */
  activeIncludeMemory: boolean
  /** 当前录制是否采集堆栈。 */
  activeIncludeStacks: boolean
}

/**
 * 创建录制 id。
 */
function createRecordingId(): string {
  return `performance-${nanoid()}`
}

/**
 * 启动一次录制。
 */
function startSession(
  state: PerformanceCollectorState,
  deps: PerformanceCollectorDependencies,
  options: {
    includeMemory: boolean
    includeStacks: boolean
  }
): string {
  const recordingId = createRecordingId()
  state.longTasks.length = 0
  state.stackFrames.length = 0
  state.memorySamples.length = 0

  if (options.includeMemory) {
    const sample = deps.readMemory()
    if (sample) {
      state.memorySamples.push(sample)
    }
  }

  state.activeRecordingId = recordingId
  state.activeRecordingStartedAt = deps.now()
  state.activeIncludeMemory = options.includeMemory
  state.activeIncludeStacks = options.includeStacks

  return recordingId
}

/**
 * 给性能采集器包装一个报告分发器。
 *
 * runtime client 需要把完整报告同步推回服务端，但采集器本身不应感知 hot channel；
 * 这里用薄包装保持采集逻辑独立，同时让报告产生时自动上报。
 */
function createDispatchingCollector(
  collector: PerformanceCollector,
  send: (report: PerformanceReport) => void
): PerformanceCollector {
  return {
    async recordOnce(options) {
      const report = await collector.recordOnce(options)
      send(report)
      return report
    },
    start(options) {
      return collector.start(options)
    },
    stop(recordingId) {
      const report = collector.stop(recordingId)
      send(report)
      return report
    },
    latest() {
      return collector.latest()
    },
    dispose() {
      collector.dispose()
    }
  }
}

/**
 * 等待指定时长。
 */
function waitForDuration(
  deps: PerformanceCollectorDependencies,
  durationMs: number
): Promise<void> {
  return new Promise((resolve) => {
    const timer = deps.setTimeout(() => {
      deps.clearTimeout(timer)
      resolve()
    }, durationMs)
  })
}

/**
 * 构建最终报告。
 */
function buildReport(options: {
  recordingId: string
  pageId: string
  startedAt: number
  endedAt: number
  source: 'cdp' | 'hook'
  includeMemory: boolean
  includeStacks: boolean
  longTasks: LongTaskRecord[]
  memorySamples: MemorySample[]
  stackFrames: StackFrameSummary[]
  limitations: string[]
  rawProfilePath?: string
  artifacts?: PerformanceArtifact[]
}): PerformanceReport {
  const memory = options.includeMemory
    ? buildMemorySummary(options.memorySamples)
    : undefined
  const summary = buildPerformanceSummary({
    longTasks: options.longTasks,
    memorySamples: options.includeMemory ? options.memorySamples : []
  })
  const stacks = options.includeStacks
    ? buildStackSummary(options.stackFrames, {
        rawProfilePath: options.rawProfilePath,
        limitation:
          options.stackFrames.length > 0
            ? undefined
            : 'Runtime path only exposes error stacks when the page reports them'
      })
    : undefined
  const report: PerformanceReport = {
    recordingId: options.recordingId,
    pageId: options.pageId,
    source: options.source,
    startedAt: options.startedAt,
    endedAt: options.endedAt,
    durationMs: options.endedAt - options.startedAt,
    summary,
    longTasks: [...options.longTasks],
    memory,
    stacks,
    artifacts: options.artifacts,
    limitations: options.limitations
  }

  return report
}

/**
 * 结束一次录制并返回报告。
 */
function stopSession(options: {
  state: PerformanceCollectorState
  deps: PerformanceCollectorDependencies
  recordingId: string
  source: 'cdp' | 'hook'
}): PerformanceReport {
  const { state, deps, recordingId, source } = options

  if (!state.activeRecordingId || state.activeRecordingId !== recordingId) {
    throw new Error(`Performance recording not found: ${recordingId}`)
  }

  if (state.activeIncludeMemory) {
    const sample = deps.readMemory()
    if (sample) {
      state.memorySamples.push(sample)
    }
  }

  const report = buildReport({
    recordingId: state.activeRecordingId,
    pageId: deps.pageId,
    startedAt: state.activeRecordingStartedAt,
    endedAt: deps.now(),
    source,
    includeMemory: state.activeIncludeMemory,
    includeStacks: state.activeIncludeStacks,
    longTasks: state.longTasks,
    memorySamples: state.memorySamples,
    stackFrames: state.stackFrames,
    limitations: [
      'Runtime path only sees browser-observable signals',
      'Runtime path cannot produce a full CPU profile or heap snapshot'
    ]
  })

  state.latestReport = report
  state.activeRecordingId = undefined
  state.activeRecordingStartedAt = 0
  state.activeIncludeMemory = true
  state.activeIncludeStacks = true

  return report
}

/**
 * 从当前运行环境读取内存。
 */
function readBrowserMemory(): MemorySample | undefined {
  const memory = (performance as Performance & {
    memory?: {
      usedJSHeapSize: number
      totalJSHeapSize: number
      jsHeapSizeLimit: number
    }
  }).memory

  if (!memory) {
    return undefined
  }

  return {
    timestamp: Date.now(),
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit
  }
}

/**
 * 安装 long task 监听器。
 */
function observeLongTasks(
  push: (task: LongTaskRecord) => void,
  longTaskThresholdMs = 50
): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    return () => {}
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration < longTaskThresholdMs) {
        continue
      }

      push({
        startTime: entry.startTime,
        durationMs: entry.duration,
        name: entry.name,
        source: 'longtask'
      })
    }
  })

  observer.observe({ type: 'longtask', buffered: true })

  return () => {
    observer.disconnect()
  }
}

/**
 * 安装 long-animation-frame 监听器。
 */
function observeAnimationFrameTasks(
  push: (task: LongTaskRecord) => void
): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    return () => {}
  }

  const supported = PerformanceObserver.supportedEntryTypes.includes(
    'long-animation-frame'
  )

  if (!supported) {
    return () => {}
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      push({
        startTime: entry.startTime,
        durationMs: entry.duration,
        name: entry.name,
        source: 'long-animation-frame'
      })
    }
  })

  observer.observe({ type: 'long-animation-frame', buffered: true })

  return () => {
    observer.disconnect()
  }
}

/**
 * 安装 window error 监听器。
 */
function observeWindowErrorStack(
  push: (frame: StackFrameSummary) => void
): () => void {
  const onError = (event: ErrorEvent): void => {
    const error = event.error as Error | undefined
    const frames = parseStackFrames(error?.stack)
    if (frames.length === 0 && event.message) {
      push({ functionName: event.message })
      return
    }

    frames.forEach((frame) => {
      push(frame)
    })
  }

  window.addEventListener('error', onError)

  return () => {
    window.removeEventListener('error', onError)
  }
}

/**
 * 安装 unhandledrejection 监听器。
 */
function observeUnhandledRejectionStack(
  push: (frame: StackFrameSummary) => void
): () => void {
  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason as Error | undefined
    const frames = parseStackFrames(reason?.stack)

    if (frames.length === 0 && reason?.message) {
      push({ functionName: reason.message })
      return
    }

    frames.forEach((frame) => {
      push(frame)
    })
  }

  window.addEventListener('unhandledrejection', onRejection)

  return () => {
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

/**
 * 解析 stack 文本。
 */
function parseStackFrames(stack?: string): StackFrameSummary[] {
  if (!stack) {
    return []
  }

  return stack
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /at\s+(.*?)\s+\((.*?):(\d+):(\d+)\)$/.exec(line)

      if (match) {
        return {
          functionName: match[1] || '<anonymous>',
          url: match[2],
          lineNumber: Number(match[3]),
          columnNumber: Number(match[4])
        }
      }

      return { functionName: line }
    })
}
