import type CDP from 'chrome-remote-interface'
import { nanoid } from 'nanoid'
import { safeStringify } from '../shared/serialization'
import type { ConsoleRecord } from '../types'

/**
 * CDP Console 监听参数。
 *
 * Console 事件来自浏览器 Runtime 层，比页面 Hook 更接近 DevTools Console。
 */
export interface CdpConsoleOptions {
  /** 已连接的 CDP client。 */
  readonly client: CDP.Client
  /** 页面 ID，用于和 runtime target 合并展示。 */
  readonly pageId: string
  /** 写入日志缓存的回调。 */
  readonly push: (record: ConsoleRecord) => void
}

/**
 * 启动 CDP Console 监听。
 *
 * 配置 CDP 后，日志能力优先使用该通道；Hook 仍保留早期日志和兜底能力。
 */
export async function startCdpConsole(
  options: CdpConsoleOptions
): Promise<void> {
  await options.client.Runtime.enable()
  options.client.Runtime.consoleAPICalled((event) => {
    options.push({
      id: nanoid(),
      pageId: options.pageId,
      source: 'cdp',
      level: normalizeConsoleLevel(event.type),
      message: event.args
        .map((arg) => safeStringify(arg.value ?? arg.description))
        .join(' '),
      timestamp: event.timestamp
    })
  })
}

/**
 * 归一化 CDP 日志级别。
 *
 * CDP 使用 warning 等类型名，MCP 工具输出需要和浏览器 console 常见级别保持一致。
 */
function normalizeConsoleLevel(level: string): ConsoleRecord['level'] {
  if (level === 'warning') {
    return 'warn'
  }

  if (level === 'error' || level === 'debug' || level === 'info') {
    return level
  }

  return 'log'
}
