import { describe, expect, it } from 'vitest'
import { vueMcpNext } from '../src/index'

describe('vueMcpNext', () => {
  it('creates a Vite plugin skeleton', () => {
    expect(vueMcpNext().name).toBe('vite-plugin-vue-mcp-next')
  })
})

