import { nanoid } from 'nanoid'
import { safeStringify } from '../shared/serialization'
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
    const serializedArgs = serializeConsoleArgs(args)

    options.send({
      id: nanoid(),
      pageId: options.pageId,
      source: 'hook',
      level,
      message: serializedArgs.join(' '),
      args: serializedArgs,
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

/**
 * 将 Console 参数转换成 HMR 可传输的安全快照。
 *
 * Vue 组件、VNode 和 Proxy 对象经常带有循环引用，保留原始引用会让 Vite WebSocket
 * 在序列化 payload 时失败；这里在浏览器侧提前裁剪，保证日志采集不会反过来打断页面热更新。
 */
function serializeConsoleArgs(args: unknown[]): string[] {
  return args.map((arg) => safeStringify(arg))
}
