/**
 * MCP 性能诊断工具。
 *
 * 该文件把 runtime 轻量采样和 CDP 深度采样统一成一组工具，适合分析页面是否卡顿、
 * 是否存在内存增长，以及在调试权限可用时进一步拿到 CPU profile 和 heap snapshot。
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type CDP from 'chrome-remote-interface'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { MCP_TOOL_NAMES } from '../../constants'
import {
  recordCdpPerformance,
  startCdpPerformanceRecording,
  stopCdpPerformanceRecording,
  takeHeapSnapshot
} from '../../cdp/cdpPerformance'
import type {
  PerformanceReport,
  VueMcpNextContext
} from '../../types'
import {
  closeCdpClient,
  connectCdpForPage,
  createToolError,
  createToolResponse,
  requestRuntimeData
} from '../routeTools'

const PERFORMANCE_NOT_AVAILABLE_ERROR =
  'Performance diagnostics are disabled by configuration'

const activeCdpPerformanceClients = new Map<string, CDP.Client>()

type PerformanceCdpConnection = NonNullable<
  Awaited<ReturnType<typeof connectCdpForPage>>
>

interface PerformanceCdpConnectResult {
  /** CDP 连接成功时返回可直接用于性能采样的客户端。 */
  readonly cdp?: PerformanceCdpConnection
  /** CDP 端口不可达或 target 查询失败时保留原始错误，强制 CDP 模式需要向用户说明原因。 */
  readonly error?: string
}

/**
 * 注册性能诊断工具。
 *
 * 这组工具同时覆盖无调试权限的 runtime 采样和有 CDP 权限的深度诊断，
 * 让上层只需要关心“是否卡顿”和“能否进一步看 profile”两个层次。
 */
export function registerPerformanceTools(
  server: McpServer,
  ctx: VueMcpNextContext
): void {
  server.registerTool(
    MCP_TOOL_NAMES.recordPerformance,
    {
      description: 'Record a performance sample for the selected page.',
      inputSchema: {
        pageId: z.string().optional(),
        durationMs: z.number().optional(),
        includeMemory: z.boolean().optional(),
        includeStacks: z.boolean().optional()
      }
    },
    async (input) => handleRecordPerformance(ctx, input as RecordPerformanceInput)
  )

  server.registerTool(
    MCP_TOOL_NAMES.startPerformanceRecording,
    {
      description: 'Start a performance recording session.',
      inputSchema: {
        pageId: z.string().optional(),
        includeMemory: z.boolean().optional(),
        includeStacks: z.boolean().optional()
      }
    },
    async (input) =>
      handleStartPerformanceRecording(ctx, input as StartPerformanceInput)
  )

  server.registerTool(
    MCP_TOOL_NAMES.stopPerformanceRecording,
    {
      description: 'Stop a performance recording session.',
      inputSchema: {
        recordingId: z.string()
      }
    },
    async (input) =>
      handleStopPerformanceRecording(ctx, input as StopPerformanceInput)
  )

  server.registerTool(
    MCP_TOOL_NAMES.getPerformanceReport,
    {
      description: 'Get cached performance reports and active sessions.',
      inputSchema: {
        pageId: z.string().optional(),
        recordingId: z.string().optional(),
        limit: z.number().optional()
      }
    },
    (input) => handleGetPerformanceReport(ctx, input as GetReportInput)
  )

  server.registerTool(
    MCP_TOOL_NAMES.takeHeapSnapshot,
    {
      description: 'Take a heap snapshot with CDP.',
      inputSchema: {
        pageId: z.string().optional()
      }
    },
    async (input) =>
      handleTakeHeapSnapshot(ctx, input as TakeHeapSnapshotInput)
  )
}

/**
 * 追加性能报告到缓存。
 *
 * runtime 热推送和 tool 返回可能会同时命中同一份报告，因此这里只做幂等写入，
 * 避免同一个 recordingId 在缓存里重复占位。
 */
export function appendPerformanceReport(
  ctx: VueMcpNextContext,
  report: PerformanceReport
): void {
  if (
    ctx.performanceReports
      .all()
      .some((item) => item.recordingId === report.recordingId)
  ) {
    return
  }

  ctx.performanceReports.push(report)
}

/**
 * 性能采样输入。
 */
interface RecordPerformanceInput {
  readonly pageId?: string
  readonly durationMs?: number
  readonly includeMemory?: boolean
  readonly includeStacks?: boolean
}

/**
 * 性能录制启动输入。
 */
interface StartPerformanceInput {
  readonly pageId?: string
  readonly includeMemory?: boolean
  readonly includeStacks?: boolean
}

/**
 * 性能录制停止输入。
 */
interface StopPerformanceInput {
  readonly recordingId: string
}

/**
 * 性能报告查询输入。
 */
interface GetReportInput {
  readonly pageId?: string
  readonly recordingId?: string
  readonly limit?: number
}

/**
 * heap snapshot 输入。
 */
interface TakeHeapSnapshotInput {
  readonly pageId?: string
}

/**
 * 执行一次性能采样。
 */
async function handleRecordPerformance(
  ctx: VueMcpNextContext,
  input: RecordPerformanceInput
): Promise<CallToolResult> {
  const durationMs = input.durationMs ?? ctx.options.performance.maxDurationMs
  const includeMemory =
    input.includeMemory ?? ctx.options.performance.memory.enabled
  const includeStacks =
    input.includeStacks ?? ctx.options.performance.stacks.enabled

  if (ctx.options.performance.mode === 'off') {
    return createToolError(PERFORMANCE_NOT_AVAILABLE_ERROR)
  }

  if (ctx.options.performance.mode !== 'hook') {
    const cdpResult = await connectPerformanceCdp(ctx, input.pageId)
    const cdp = cdpResult.cdp

    if (cdp) {
      try {
        const report = await recordCdpPerformance({
          client: cdp.client,
          pageId: input.pageId ?? 'cdp',
          durationMs,
          includeMemory,
          includeStacks,
          saveDir: ctx.options.performance.saveDir
        })
        appendPerformanceReport(ctx, report)

        return createToolResponse(toStructuredRecord(report))
      } finally {
        await closeCdpClient(cdp.client)
      }
    }

    if (ctx.options.performance.mode === 'cdp') {
      return createToolError(
        formatCdpUnavailableError(
          'CDP performance collection is unavailable',
          cdpResult.error
        )
      )
    }
  }

  const result = await requestRuntimeData(ctx, (event) => {
    void ctx.rpcServer?.recordPerformance({
      event,
      durationMs,
      includeMemory,
      includeStacks
    })
  })

  if (isPerformanceReport(result)) {
    appendPerformanceReport(ctx, result)
  }

  if (isPlainRecord(result)) {
    return createToolResponse(toStructuredRecord(result))
  }

  return createToolError('runtime bridge returned an invalid response')
}

/**
 * 开始一次性能录制。
 */
async function handleStartPerformanceRecording(
  ctx: VueMcpNextContext,
  input: StartPerformanceInput
): Promise<CallToolResult> {
  const includeMemory =
    input.includeMemory ?? ctx.options.performance.memory.enabled
  const includeStacks =
    input.includeStacks ?? ctx.options.performance.stacks.enabled

  if (ctx.options.performance.mode === 'off') {
    return createToolError(PERFORMANCE_NOT_AVAILABLE_ERROR)
  }

  if (ctx.options.performance.mode !== 'hook') {
    const cdpResult = await connectPerformanceCdp(ctx, input.pageId)
    const cdp = cdpResult.cdp

    if (cdp) {
      try {
        const session = await startCdpPerformanceRecording({
          client: cdp.client,
          pageId: input.pageId ?? 'cdp',
          includeMemory,
          includeStacks,
          saveDir: ctx.options.performance.saveDir
        })

        ctx.performanceSessions.set(session.recordingId, {
          recordingId: session.recordingId,
          pageId: session.pageId,
          source: 'cdp',
          startedAt: session.startedAt,
          includeMemory,
          includeStacks,
          mode: ctx.options.performance.mode
        })
        activeCdpPerformanceClients.set(session.recordingId, cdp.client)

        return createToolResponse(
          toStructuredRecord({
            ...session,
            source: 'cdp'
          })
        )
      } catch (error) {
        await closeCdpClient(cdp.client)
        return createToolError(
          error instanceof Error ? error.message : String(error)
        )
      }
    }

    if (ctx.options.performance.mode === 'cdp') {
      return createToolError(
        formatCdpUnavailableError(
          'CDP performance collection is unavailable',
          cdpResult.error
        )
      )
    }
  }

  const result = await requestRuntimeData(ctx, (event) => {
    void ctx.rpcServer?.startPerformanceRecording({
      event,
      includeMemory,
      includeStacks
    })
  })

  if (isPerformanceStartResult(result)) {
    ctx.performanceSessions.set(result.recordingId, {
      recordingId: result.recordingId,
      pageId: input.pageId ?? 'runtime',
      source: 'hook',
      startedAt: result.startedAt,
      includeMemory,
      includeStacks,
      mode: ctx.options.performance.mode
    })
  }

  if (isPlainRecord(result)) {
    return createToolResponse(toStructuredRecord(result))
  }

  return createToolError('runtime bridge returned an invalid response')
}

/**
 * 结束一次性能录制。
 */
async function handleStopPerformanceRecording(
  ctx: VueMcpNextContext,
  input: StopPerformanceInput
): Promise<CallToolResult> {
  const session = ctx.performanceSessions.get(input.recordingId)

  if (!session) {
    return createToolError(`Performance recording not found: ${input.recordingId}`)
  }

  try {
    if (session.source === 'cdp') {
      const client = activeCdpPerformanceClients.get(input.recordingId)

      if (!client) {
        return createToolError(
          `CDP client not found for recording: ${input.recordingId}`
        )
      }

      const report = await stopCdpPerformanceRecording({
        client,
        session
      })
      appendPerformanceReport(ctx, report)

      return createToolResponse(toStructuredRecord(report))
    }

    const result = await requestRuntimeData(ctx, (event) => {
      void ctx.rpcServer?.stopPerformanceRecording({
        event,
        recordingId: input.recordingId
      })
    })

    if (isPerformanceReport(result)) {
      appendPerformanceReport(ctx, result)
    }

    if (isPlainRecord(result)) {
      return createToolResponse(toStructuredRecord(result))
    }

    return createToolError('runtime bridge returned an invalid response')
  } finally {
    ctx.performanceSessions.delete(input.recordingId)
    const client = activeCdpPerformanceClients.get(input.recordingId)

    if (client) {
      activeCdpPerformanceClients.delete(input.recordingId)
      await closeCdpClient(client)
    }
  }
}

/**
 * 查询缓存中的性能报告。
 */
function handleGetPerformanceReport(
  ctx: VueMcpNextContext,
  input: GetReportInput
): CallToolResult {
  const reports = ctx.performanceReports
    .all()
    .filter((report) => !input.pageId || report.pageId === input.pageId)
    .filter(
      (report) => !input.recordingId || report.recordingId === input.recordingId
    )
  const limit = input.limit ?? reports.length

  return createToolResponse(toStructuredRecord({
    report: reports.at(-1) ?? null,
    reports: reports.slice(-limit),
    sessions: [...ctx.performanceSessions.values()].filter(
      (session) =>
        (!input.pageId || session.pageId === input.pageId) &&
        (!input.recordingId || session.recordingId === input.recordingId)
    )
  }))
}

/**
 * 采集 heap snapshot。
 */
async function handleTakeHeapSnapshot(
  ctx: VueMcpNextContext,
  input: TakeHeapSnapshotInput
): Promise<CallToolResult> {
  if (
    ctx.options.performance.mode === 'off' ||
    ctx.options.performance.mode === 'hook'
  ) {
    return createToolError(PERFORMANCE_NOT_AVAILABLE_ERROR)
  }

  const cdpResult = await connectPerformanceCdp(ctx, input.pageId)
  const cdp = cdpResult.cdp

  if (!cdp) {
    return createToolError(
      formatCdpUnavailableError(
        'CDP heap snapshot is unavailable',
        cdpResult.error
      )
    )
  }

  try {
    return createToolResponse(
      toStructuredRecord(await takeHeapSnapshot({
        client: cdp.client,
        pageId: input.pageId ?? 'cdp',
        saveDir: ctx.options.performance.saveDir
      }))
    )
  } finally {
    await closeCdpClient(cdp.client)
  }
}

/**
 * 尝试建立性能诊断专用 CDP 连接。
 *
 * `auto` 模式的核心承诺是“有调试权限走 CDP，没有调试权限退回 Runtime Hook”，
 * 因此 CDP discovery 的网络失败不能直接打断性能工具；只有强制 CDP 的工具分支才会把错误返回给用户。
 */
async function connectPerformanceCdp(
  ctx: VueMcpNextContext,
  pageId?: string
): Promise<PerformanceCdpConnectResult> {
  try {
    return { cdp: await connectCdpForPage(ctx, pageId) }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * 格式化 CDP 不可用错误。
 *
 * 强制 CDP 模式需要暴露底层原因方便用户检查 `--remote-debugging-port`，
 * 但普通不可用场景仍保持稳定的工具错误前缀，避免调用方只靠文案判断时被破坏。
 */
function formatCdpUnavailableError(message: string, reason?: string): string {
  if (!reason) {
    return message
  }

  return `${message}: ${reason}`
}

/**
 * 判断 runtime 回包是否为性能报告。
 */
function isPerformanceReport(value: unknown): value is PerformanceReport {
  if (!value || typeof value !== 'object') {
    return false
  }

  const report = value as Partial<PerformanceReport>

  return (
    typeof report.recordingId === 'string' &&
    typeof report.pageId === 'string' &&
    (report.source === 'hook' || report.source === 'cdp') &&
    typeof report.startedAt === 'number' &&
    typeof report.endedAt === 'number' &&
    typeof report.durationMs === 'number' &&
    Boolean(report.summary) &&
    Array.isArray(report.longTasks) &&
    Array.isArray(report.limitations)
  )
}

/**
 * 判断 runtime 回包是否为录制启动结果。
 */
function isPerformanceStartResult(
  value: unknown
): value is { recordingId: string; startedAt: number } {
  if (!value || typeof value !== 'object') {
    return false
  }

  const result = value as Partial<{ recordingId: string; startedAt: number }>

  return (
    typeof result.recordingId === 'string' &&
    typeof result.startedAt === 'number'
  )
}

/**
 * 判断值是否为可直接返回给 MCP 的普通对象。
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 将任意对象收敛为 MCP 需要的普通 record。
 */
function toStructuredRecord(value: unknown): Record<string, unknown> {
  if (isPlainRecord(value)) {
    return value
  }

  return {}
}
