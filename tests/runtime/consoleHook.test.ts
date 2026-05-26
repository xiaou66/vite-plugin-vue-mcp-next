import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installConsoleHook } from '../../src/runtime/consoleHook'

type Listener = (event: ErrorEvent) => void
type ConsoleArgReference = {
  readonly type: 'object'
  readonly argId: string
  readonly label: string
}

const originalWindow = globalThis.window
const originalErrorEvent = globalThis.ErrorEvent
const DUPLICATE_LIMIT = 50
const SUPPRESSED_SOURCE_COUNT = 55
const ALTERNATING_LOG_COUNT = 60
const OVERSIZED_MESSAGE_LENGTH = 12_000

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

  it('keeps nested circular console arguments serializable without object traversal', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const component: { vnode?: { component: unknown } } = {}
    const vnode = { component }
    component.vnode = vnode
    const records: unknown[] = []
    const restore = installConsoleHook({
      pageId: 'runtime-1',
      send(record) {
        records.push(record)
      }
    })

    console.warn('vue warn', { component })
    restore()

    const [record] = records as Array<{
      message: string
      args?: unknown[]
    }>
    expect(() => JSON.stringify(record)).not.toThrow()
    expect(record.message).toContain('[Object:console-arg-')
    expect(record.args?.[0]).toBe('vue warn')
    expect(record.args?.[1]).toMatchObject({ type: 'object' })
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

  it('sends object labels instead of raw circular objects', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const component: { name: string; vnode?: unknown } = { name: 'TaskList' }
    const vnode = { component }
    component.vnode = vnode
    const records: unknown[] = []
    const restore = installConsoleHook({
      pageId: 'runtime-1',
      send(record) {
        records.push(record)
        JSON.stringify(record)
      }
    })

    console.warn('component', component)
    restore()

    const [record] = records as Array<{ args: unknown[]; message: string }>
    expect(record.message).toContain('component')
    expect(record.args[0]).toBe('component')
    expect(record.args[1]).toMatchObject({ type: 'object' })
    expect(record.args[1]).not.toBe(component)
  })

  it('does not traverse large console arguments', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const records: unknown[] = []
    const value: Record<string, unknown> = {}
    Array.from({ length: 40 }).forEach((_, index) => {
      value[`key${String(index)}`] = index
    })
    const restore = installConsoleHook({
      pageId: 'runtime-1',
      send(record) {
        records.push(record)
      }
    })

    console.warn(value)
    restore()

    const [record] = records as Array<{ args: unknown[] }>
    expect(record.args[0]).toMatchObject({ type: 'object' })
  })

  it('suppresses only consecutive duplicate string messages', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const records: unknown[] = []
    const restore = installConsoleHook({
      pageId: 'runtime-1',
      send(record) {
        records.push(record)
      }
    })

    Array.from({ length: ALTERNATING_LOG_COUNT }).forEach((_, index) => {
      console.warn(index % 2 === 0 ? 'repeat-a' : 'repeat-b')
    })
    restore()

    expect(records).toHaveLength(ALTERNATING_LOG_COUNT)
  })

  it('suppresses repeated object-only logs by object label', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const records: unknown[] = []
    const restore = installConsoleHook({
      pageId: 'runtime-1',
      send(record) {
        records.push(record)
      }
    })

    Array.from({ length: ALTERNATING_LOG_COUNT }).forEach((_, index) => {
      console.warn({ bucket: index % 2 === 0 ? 'a' : 'b' })
    })
    restore()

    const typedRecords = records as Array<{ args?: unknown[]; message: string }>
    expect(typedRecords).toHaveLength(DUPLICATE_LIMIT + 1)
    expect(typedRecords.at(-1)?.message).toBe(
      'Suppressed 10 duplicate warn logs: [Object]'
    )
    expect(typedRecords.at(-1)?.args).toEqual([])
  })

  it('does not enumerate object arguments when creating hook records', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let ownKeysCount = 0
    const proxy = new Proxy(
      { vnode: { component: 'demo' } },
      {
        ownKeys(target) {
          ownKeysCount++
          return Reflect.ownKeys(target)
        }
      }
    )
    const records: unknown[] = []
    const restore = installConsoleHook({
      pageId: 'runtime-1',
      send(record) {
        records.push(record)
      }
    })

    console.warn('vue warn', proxy)
    restore()

    const [record] = records as Array<{ args: unknown[]; message: string }>
    expect(ownKeysCount).toBe(0)
    expect(record.message).toMatch(/^vue warn \[Object:console-arg-/)
    expect(record.args[0]).toBe('vue warn')
    const reference = record.args[1] as ConsoleArgReference
    expect(reference.type).toBe('object')
    expect(reference.label).toMatch(/^\[Object:console-arg-/)
    expect(record.message).toBe(`vue warn ${reference.label}`)
  })

  it('returns inspectable object references for later MCP calls', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const records: unknown[] = []
    const restore = installConsoleHook({
      pageId: 'runtime-1',
      send(record) {
        records.push(record)
      }
    })

    console.warn('inspect later', { count: 1 })
    restore()

    const [record] = records as Array<{
      args: [string, ConsoleArgReference]
      message: string
    }>
    expect(record.args[1].argId).toMatch(/^console-arg-/)
    expect(record.args[1].label).toBe(`[Object:${record.args[1].argId}]`)
    expect(record.args[1].type).toBe('object')
    expect(record.message).toBe(`inspect later ${record.args[1].label}`)
  })

  it('omits argument previews for oversized console messages', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const records: unknown[] = []
    const restore = installConsoleHook({
      pageId: 'runtime-1',
      send(record) {
        records.push(record)
      }
    })

    console.warn('x'.repeat(OVERSIZED_MESSAGE_LENGTH), { expensive: true })
    restore()

    const [record] = records as Array<{ args: unknown[]; message: string }>
    expect(record.args).toEqual([])
    expect(record.message).toContain('[Truncated]')
  })

  it('emits a summary when consecutive duplicates are suppressed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const records: unknown[] = []
    const restore = installConsoleHook({
      pageId: 'runtime-1',
      send(record) {
        records.push(record)
      }
    })

    Array.from({ length: SUPPRESSED_SOURCE_COUNT }).forEach(() => {
      console.warn('same message')
    })
    console.warn('next message')
    restore()

    const typedRecords = records as Array<{ args?: unknown[]; message: string }>
    expect(typedRecords).toHaveLength(DUPLICATE_LIMIT + 2)
    expect(typedRecords.at(-2)?.message).toBe(
      'Suppressed 5 duplicate warn logs: same message'
    )
    expect(typedRecords.at(-2)?.args).toEqual([])
    expect(typedRecords.at(-1)?.message).toBe('next message')
  })
})
