import { describe, expect, it } from 'vitest'
import { mergeOptions, RESOLVED_VIRTUAL_RUNTIME_ID } from '../../src/constants'
import { createRuntimeInjectionController } from '../../src/plugin/injectRuntime'

describe('runtime injection', () => {
  it('loads runtime client from the published scoped package name', () => {
    const controller = createRuntimeInjectionController(mergeOptions(), () =>
      undefined
    )

    expect(controller.load(RESOLVED_VIRTUAL_RUNTIME_ID)).toBe(
      "import { startRuntimeClient } from '@xiaou66/vite-plugin-vue-mcp-next/runtime/client';\nvoid startRuntimeClient();"
    )
  })
})
