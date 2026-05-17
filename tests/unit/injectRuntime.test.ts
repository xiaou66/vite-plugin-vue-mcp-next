import { describe, expect, it } from 'vitest'
import {
  mergeOptions,
  RESOLVED_VIRTUAL_SNAPDOM_LOADER_ID,
  RESOLVED_VIRTUAL_RUNTIME_ID,
  RESOLVED_VIRTUAL_SCREENSHOT_CONFIG_ID,
  VIRTUAL_SNAPDOM_LOADER_ID,
  VIRTUAL_SCREENSHOT_CONFIG_ID
} from '../../src/constants'
import { createRuntimeInjectionController } from '../../src/plugin/injectRuntime'

describe('runtime injection', () => {
  it('loads runtime client from the published scoped package name', () => {
    const controller = createRuntimeInjectionController(mergeOptions(), () =>
      undefined
    )

    expect(controller.load(RESOLVED_VIRTUAL_RUNTIME_ID)).toContain(
      "import { setScreenshotModuleRegistry, setSnapdomLoader, startRuntimeClient } from '@xiaou66/vite-plugin-vue-mcp-next/runtime/client';"
    )
    expect(controller.load(RESOLVED_VIRTUAL_RUNTIME_ID)).toContain(
      `import { screenshotModuleRegistry } from '${VIRTUAL_SCREENSHOT_CONFIG_ID}';`
    )
    expect(controller.load(RESOLVED_VIRTUAL_RUNTIME_ID)).toContain(
      `import { loadSnapdom } from '${VIRTUAL_SNAPDOM_LOADER_ID}';`
    )
    expect(controller.load(RESOLVED_VIRTUAL_RUNTIME_ID)).toContain(
      'setScreenshotModuleRegistry(screenshotModuleRegistry);'
    )
    expect(controller.load(RESOLVED_VIRTUAL_RUNTIME_ID)).toContain(
      'setSnapdomLoader(loadSnapdom);'
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

  it('generates a missing dependency loader when snapdom is not installed in project', () => {
    const controller = createRuntimeInjectionController(mergeOptions(), () => ({
      root: '/private/tmp/vite-plugin-vue-mcp-next-no-snapdom-project'
    }) as never)

    expect(controller.resolveId(VIRTUAL_SNAPDOM_LOADER_ID)).toBe(
      RESOLVED_VIRTUAL_SNAPDOM_LOADER_ID
    )
    expect(controller.load(RESOLVED_VIRTUAL_SNAPDOM_LOADER_ID)).toContain(
      'Promise.reject(new Error("缺少可选依赖 @zumer/snapdom。DOM 截图降级需要该依赖，请执行：pnpm add -D @zumer/snapdom"));'
    )
  })
})
