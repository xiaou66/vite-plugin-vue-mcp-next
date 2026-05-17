import { describe, expect, it } from 'vitest'
import {
  mergeOptions,
  RESOLVED_VIRTUAL_RUNTIME_ID,
  RESOLVED_VIRTUAL_SCREENSHOT_CONFIG_ID,
  VIRTUAL_SCREENSHOT_CONFIG_ID
} from '../../src/constants'
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

  it('generates static imports for snapdom extension Vite paths', () => {
    const controller = createRuntimeInjectionController(
      mergeOptions({
        screenshot: {
          snapdom: {
            plugins: [
              '/src/screenshot/watermark.ts',
              {
                path: '@/screenshot/mask-sensitive',
                exportName: 'createMaskPlugin'
              }
            ],
            filter: '/src/screenshot/filter.ts',
            fallbackURL: '/src/screenshot/fallback-url.ts'
          }
        }
      }),
      () => undefined
    )

    expect(controller.resolveId(VIRTUAL_SCREENSHOT_CONFIG_ID)).toBe(
      RESOLVED_VIRTUAL_SCREENSHOT_CONFIG_ID
    )
    expect(controller.load(RESOLVED_VIRTUAL_SCREENSHOT_CONFIG_ID)).toContain(
      'import * as m0 from "/src/screenshot/watermark.ts";'
    )
    expect(controller.load(RESOLVED_VIRTUAL_SCREENSHOT_CONFIG_ID)).toContain(
      'import * as m1 from "@/screenshot/mask-sensitive";'
    )
    expect(controller.load(RESOLVED_VIRTUAL_SCREENSHOT_CONFIG_ID)).toContain(
      '"/src/screenshot/filter.ts": m2'
    )
  })
})
