/**
 * CDP 性能采集。
 *
 * 该文件只处理浏览器调试协议可见的性能指标、CPU profile 和 heap snapshot，不承载 runtime 降级逻辑。
 */
import type CDP from 'chrome-remote-interface'
import {
  buildMemorySummary,
  buildPerformanceSummary,
  buildStackSummary
} from '../performance/summary'
import { writePerformanceArtifact } from '../performance/output'
import type {
  LongTaskRecord,
  MemorySample,
  PerformanceArtifact,
  PerformanceReport,
  StackFrameSummary
} from '../types'

/**
 * CDP 性能采集参数。
 */
export interface CdpPerformanceOptions {
  /** 已连接的 CDP client。 */
  readonly client: CDP.Client
  /** 当前页面 id，用于输出产物命名和报告聚合。 */
  readonly pageId: string
  /** 采集窗口时长。 */
  readonly durationMs: number
  /** 是否采集内存。 */
  readonly includeMemory: boolean
  /** 是否采集可定位堆栈。 */
  readonly includeStacks: boolean
  /** 保存原始 profile 的目录，默认 `.vite-mcp/performance`。 */
  readonly saveDir?: string
}

/**
 * CDP 性能启动参数。
 *
 * start 阶段不需要采样窗口时长，只负责打开 profiler 并留下会话信息。
 */
export type CdpPerformanceStartOptions = Omit<CdpPerformanceOptions, 'durationMs'>

/**
 * CDP 性能会话信息。
 *
 * 交互式录制需要在 start/stop 两次工具调用之间保持会话元数据，
 * 但不把裸 client 暴露给上层的 structuredContent。
 */
export interface CdpPerformanceSession {
  /** 录制 id。 */
  readonly recordingId: string
  /** 页面 id。 */
  readonly pageId: string
  /** 开始时间。 */
  readonly startedAt: number
  /** 是否采集内存。 */
  readonly includeMemory: boolean
  /** 是否采集堆栈。 */
  readonly includeStacks: boolean
  /** 保存目录。 */
  readonly saveDir?: string
}

/**
 * Heap snapshot 采集参数。
 */
export interface HeapSnapshotOptions {
  /** 已连接的 CDP client。 */
  readonly client: CDP.Client
  /** 当前页面 id，用于输出产物命名。 */
  readonly pageId: string
  /** 保存 heap snapshot 的目录。 */
  readonly saveDir: string
}

/**
 * CDP 的最小性能 metric 结构。
 */
interface CdpMetric {
  /** metric 名称。 */
  readonly name: string
  /** metric 值。 */
  readonly value: number
}

/**
 * CDP 性能 metric 返回值。
 */
interface CdpMetricsResult {
  readonly metrics: CdpMetric[]
}

/**
 * CDP CPU profile 结构。
 */
interface CdpCpuProfile {
  readonly nodes?: CdpCpuProfileNode[]
  readonly samples?: number[]
  readonly timeDeltas?: number[]
}

/**
 * CDP CPU profile stop 返回值。
 */
interface CdpProfileResult {
  readonly profile: CdpCpuProfile
}

/**
 * CPU profile 节点。
 */
interface CdpCpuProfileNode {
  readonly id: number
  readonly callFrame: {
    readonly functionName: string
    readonly url?: string
    readonly lineNumber?: number
    readonly columnNumber?: number
  }
  readonly hitCount?: number
}

/**
 * 使用 CDP 采集性能报告。
 */
export async function recordCdpPerformance(
  options: CdpPerformanceOptions
): Promise<PerformanceReport> {
  const session = await startCdpPerformanceRecording(options)
  await waitForDuration(options.durationMs)
  return stopCdpPerformanceRecording({
    client: options.client,
    session
  })
}

/**
 * 开始一次 CDP 性能录制。
 */
export async function startCdpPerformanceRecording(
  options: CdpPerformanceStartOptions
): Promise<CdpPerformanceSession> {
  await options.client.Performance.enable()
  await options.client.Profiler.enable()
  await options.client.Profiler.start()

  return {
    recordingId: createRecordingId(options.pageId),
    pageId: options.pageId,
    startedAt: Date.now(),
    includeMemory: options.includeMemory,
    includeStacks: options.includeStacks,
    saveDir: options.saveDir
  }
}

/**
 * 停止一次 CDP 性能录制并生成报告。
 */
export async function stopCdpPerformanceRecording(options: {
  readonly client: CDP.Client
  readonly session: CdpPerformanceSession
}): Promise<PerformanceReport> {
  const endedAt = Date.now()
  const [metricsResult, profileResult] = await Promise.all([
    options.client.Performance.getMetrics() as Promise<CdpMetricsResult>,
    options.client.Profiler.stop() as Promise<CdpProfileResult>
  ])

  const metrics = toMetricMap(metricsResult.metrics)
  const longTasks = toLongTaskRecords(metrics)
  const memorySamples = options.session.includeMemory
    ? [toMemorySample(metrics)]
    : []
  const memory = options.session.includeMemory
    ? buildMemorySummary(memorySamples)
    : undefined
  const stacks = options.session.includeStacks
    ? buildStackSummary(aggregateCpuProfile(profileResult.profile))
    : undefined
  const artifact = await writeCpuProfileArtifact(
    {
      pageId: options.session.pageId,
      saveDir: options.session.saveDir
    },
    profileResult.profile
  )
  const report: PerformanceReport = {
    recordingId: options.session.recordingId,
    pageId: options.session.pageId,
    source: 'cdp',
    startedAt: options.session.startedAt,
    endedAt,
    durationMs: endedAt - options.session.startedAt,
    summary: buildPerformanceSummary({
      longTasks,
      memorySamples
    }),
    longTasks,
    memory,
    stacks,
    artifacts: [artifact],
    limitations: [
      'CDP path returns sampled CPU profile data, not a full instruction trace'
    ]
  }

  return report
}

/**
 * 采集 heap snapshot 并返回路径型产物。
 */
export async function takeHeapSnapshot(
  options: HeapSnapshotOptions
): Promise<PerformanceArtifact> {
  const chunks: string[] = []

  await options.client.HeapProfiler.enable()
  options.client.HeapProfiler.addHeapSnapshotChunk((event) => {
    const payload = event as { chunk?: string }
    if (payload.chunk) {
      chunks.push(payload.chunk)
    }
  })

  await options.client.HeapProfiler.takeHeapSnapshot({
    reportProgress: false
  })

  const artifact = await writePerformanceArtifact({
    root: process.cwd(),
    saveDir: options.saveDir,
    fileName: `${options.pageId}-heap-snapshot.heapsnapshot`,
    kind: 'heap-snapshot',
    data: Buffer.from(chunks.join(''))
  })

  return artifact
}

/**
 * 创建录制 id。
 */
function createRecordingId(pageId: string): string {
  return `cdp-${pageId}-${String(Date.now())}`
}

/**
 * 等待指定时长。
 */
function waitForDuration(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, durationMs)
  })
}

/**
 * 将 metrics 转成 map。
 */
function toMetricMap(metrics: CdpMetric[]): Map<string, number> {
  return new Map(metrics.map((metric) => [metric.name, metric.value]))
}

/**
 * 将 CDP metrics 归一成 long task 记录。
 */
function toLongTaskRecords(metrics: Map<string, number>): LongTaskRecord[] {
  const taskDuration = metrics.get('TaskDuration') ?? 0

  if (taskDuration <= 0) {
    return []
  }

  return [
    {
      startTime: 0,
      durationMs: taskDuration,
      name: 'TaskDuration',
      source: 'cpu-profile'
    }
  ]
}

/**
 * 将 metrics 归一成内存采样。
 */
function toMemorySample(metrics: Map<string, number>): MemorySample {
  return {
    timestamp: Date.now(),
    usedJSHeapSize: metrics.get('JSHeapUsedSize'),
    totalJSHeapSize: metrics.get('JSHeapTotalSize'),
    jsHeapSizeLimit: metrics.get('JSHeapSizeLimit')
  }
}

/**
 * 聚合 CPU profile 热点。
 */
function aggregateCpuProfile(profile: CdpCpuProfile): StackFrameSummary[] {
  const nodes = profile.nodes ?? []
  const nodeMap = new Map<number, AggregatedFrame>()
  const nodeIndex = new Map<number, CdpCpuProfileNode>()

  nodes.forEach((node) => nodeIndex.set(node.id, node))
  ;(profile.samples ?? []).forEach((nodeId, index) => {
    const node = nodeIndex.get(nodeId)
    if (!node) {
      return
    }

    const delta = profile.timeDeltas?.[index] ?? 0
    const current = nodeMap.get(nodeId) ?? {
      functionName: node.callFrame.functionName || '<anonymous>',
      url: node.callFrame.url,
      lineNumber: node.callFrame.lineNumber,
      columnNumber: node.callFrame.columnNumber,
      selfTimeMs: 0,
      totalTimeMs: 0,
      hitCount: 0
    }

    nodeMap.set(nodeId, {
      ...current,
      selfTimeMs: current.selfTimeMs + delta,
      totalTimeMs: current.totalTimeMs + delta,
      hitCount: current.hitCount + 1
    })
  })

  return [...nodeMap.values()]
}

/**
 * CDP 热点帧的内部累加结构。
 */
interface AggregatedFrame extends StackFrameSummary {
  selfTimeMs: number
  totalTimeMs: number
  hitCount: number
}

/**
 * 将 CPU profile 写成原始文件。
 */
async function writeCpuProfileArtifact(
  options: {
    readonly pageId: string
    readonly saveDir?: string
  },
  profile: CdpCpuProfile
): Promise<PerformanceArtifact> {
  return writePerformanceArtifact({
    root: process.cwd(),
    saveDir: options.saveDir ?? '.vite-mcp/performance',
    fileName: `${options.pageId}-cpu-profile.cpuprofile`,
    kind: 'cpu-profile',
    data: Buffer.from(JSON.stringify(profile, null, 2))
  })
}
