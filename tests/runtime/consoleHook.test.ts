import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installConsoleHook } from '../../src/runtime/consoleHook'

type Listener = (event: ErrorEvent) => void

const originalWindow = globalThis.window
const originalErrorEvent = globalThis.ErrorEvent

describe('console hook', () => {
  let listeners: Listener[]

  beforeEach(() => {
    listeners = []
    Object.assign(globalThis, {
      ErrorEvent: class {
        readonly type: string
        readonly message: string
        readonly error?: Error

        constructor(type: string, init: { message: string; error?: Error }) {
          this.type = type
          this.message = init.message
          this.error = init.error
        }
      },
      window: {
        addEventListener: (_type: string, listener: Listener) => {
          listeners.push(listener)
        },
        removeEventListener: (_type: string, listener: Listener) => {
          listeners = listeners.filter((item) => item !== listener)
        },
        dispatchEvent: (event: ErrorEvent) => {
          listeners.forEach((listener) => {
            listener(event)
          })
        }
      }
    })
  })

  afterEach(() => {
    Object.assign(globalThis, {
      window: originalWindow,
      ErrorEvent: originalErrorEvent
    })
    vi.restoreAllMocks()
  })

  it('captures console calls and forwards normalized records', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const records: unknown[] = []
    const restore = installConsoleHook({
      pageId: 'runtime-1',
      send(record) {
        records.push(record)
      }
    })

    console.warn('hello', { count: 1 })
    restore()

    const [record] = records as Array<{
      pageId: string
      level: string
      message: string
    }>
    expect(record.pageId).toBe('runtime-1')
    expect(record.level).toBe('warn')
    expect(record.message).toContain('hello')
  })

  it('captures unhandled errors', () => {
    const records: unknown[] = []
    const restore = installConsoleHook({
      pageId: 'runtime-1',
      send(record) {
        records.push(record)
      }
    })

    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
    restore()

    expect(records[0]).toEqual(
      expect.objectContaining({ level: 'error', message: 'boom' })
    )
  })
})
