import { describe, expect, it } from 'vitest'
import { createElementInstrumentationController } from '../../src/plugin/elementInstrumentation'

describe('element instrumentation', () => {
  it('injects readable source ids into Vue template elements', () => {
    const controller = createElementInstrumentationController({
      root: '/repo/app'
    })

    const result = controller.transform(
      [
        '<template>',
        '  <main>',
        '    <button class="save">Save</button>',
        '  </main>',
        '</template>'
      ].join('\n'),
      '/repo/app/src/pages/Home.vue'
    )

    expect(result?.code).toContain('data-v-mcp-id="src/pages/Home.vue:2:3"')
    expect(result?.code).toContain('data-v-mcp-id="src/pages/Home.vue:3:5"')
  })

  it('skips node_modules and virtual modules', () => {
    const controller = createElementInstrumentationController({
      root: '/repo/app'
    })

    expect(
      controller.transform(
        '<template><button /></template>',
        '/repo/app/node_modules/pkg/Button.vue'
      )
    ).toBeUndefined()
    expect(
      controller.transform('<template><button /></template>', '\0virtual.vue')
    ).toBeUndefined()
  })

  it('does not duplicate an existing data-v-mcp-id', () => {
    const controller = createElementInstrumentationController({
      root: '/repo/app'
    })

    const source =
      '<template><button data-v-mcp-id="manual">Save</button></template>'
    const result = controller.transform(source, '/repo/app/src/App.vue')
    const code = result?.code ?? source

    expect(code.match(/data-v-mcp-id/g)).toHaveLength(1)
  })
})
