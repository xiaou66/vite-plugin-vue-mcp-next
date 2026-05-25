import { nanoid } from 'nanoid'
import {
  createBoundedPreview,
  safeStringify
} from '../shared/serialization'
import type { ConsoleRecord } from '../types'

/**
 * Console Hook 安装参数。
 *
 * Hook 运行在浏览器页面内，需要通过 send 回调交给 Vite WebSocket，而不是直接依赖服务器模块。
 */
export interface ConsoleHookOptions {
  /** 当前页面 ID，用于服务端区分多页面日志来源。 */
  readonly pageId: string
  /** 发送规范化日志记录的回调，由 runtime client 绑定到 Vite WebSocket。 */
  readonly send: (record: ConsoleRecord) => void
}

/**
 * 安装页面 Console 和错误 Hook。
 *
 * 即使启用 CDP，也保留该 Hook，因为早期日志可能发生在 CDP target 匹配完成之前。
 */
export function installConsoleHook(options: ConsoleHookOptions): () => void {
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  }

  const emit = (level: ConsoleRecord['level'], args: unknown[]): void => {
    options.send({
      id: nanoid(),
      pageId: options.pageId,
      source: 'hook',
      level,
      message: args.map((arg) => safeStringify(arg)).join(' '),
      args: args.map((arg) => createBoundedPreview(arg)),
      timestamp: Date.now()
    })
  }

  ;(['log', 'info', 'warn', 'error', 'debug'] as const).forEach((level) => {
    console[level] = (...args: unknown[]) => {
      emit(level, args)
      originalConsole[level](...args)
    }
  })

  const onError = (event: ErrorEvent): void => {
    options.send({
      id: nanoid(),
      pageId: options.pageId,
      source: 'hook',
      level: 'error',
      message: event.message,
      stack: event.error instanceof Error ? event.error.stack : undefined,
      timestamp: Date.now()
    })
  }

  window.addEventListener('error', onError)

  return () => {
    Object.assign(console, originalConsole)
    window.removeEventListener('error', onError)
  }
}
