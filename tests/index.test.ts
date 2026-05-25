import { describe, expect, it } from 'vitest'
import { vueMcpNext } from '../src/index'
import type {
  ElementContextResult,
  ElementPickerOptions,
  ElementPickerShortcut
} from '../src'

const _typeCheck: {
  picker?: ElementPickerOptions
  shortcut?: ElementPickerShortcut
  result?: ElementContextResult
} = {}

void _typeCheck

describe('vueMcpNext', () => {
  it('creates a Vite plugin skeleton', () => {
    expect(vueMcpNext().name).toBe('vite-plugin-vue-mcp-next')
  })

  it('exports element picker public types', async () => {
    const module = await import('../src/index')

    expect(module.vueMcpNext).toBeTypeOf('function')
  })
})
