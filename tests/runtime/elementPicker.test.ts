import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installElementPicker } from '../../src/runtime/elementPicker'

describe('element picker', () => {
  const listeners = new Map<string, EventListener>()
  const writeText = vi.fn()

  beforeEach(() => {
    listeners.clear()
    writeText.mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('window', {
      addEventListener: vi.fn((name: string, handler: EventListener) => {
        listeners.set(name, handler)
      }),
      removeEventListener: vi.fn()
    })
    vi.stubGlobal('document', {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      },
      createElement: vi.fn(() => ({
        style: {},
        dataset: {},
        textContent: '',
        remove: vi.fn()
      })),
      elementFromPoint: vi.fn()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('copies a project source id when clicking an instrumented element', async () => {
    const element = {
      getAttribute: (name: string) =>
        name === 'data-v-mcp-id' ? 'src/App.vue:2:3' : null,
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 100, height: 30 })
    } as Element

    installElementPicker({
      enabled: true,
      shortcut: {
        altKey: true,
        shiftKey: true,
        metaKey: false,
        ctrlKey: false
      },
      toastDurationMs: 2200
    })

    listeners.get('keydown')?.({
      altKey: true,
      shiftKey: true,
      metaKey: false,
      ctrlKey: false
    } as KeyboardEvent)
    listeners.get('click')?.(
      {
        target: element,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent
    )

    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith('src/App.vue:2:3')
  })
})
