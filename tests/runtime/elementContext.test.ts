import { describe, expect, it } from 'vitest'
import { createElementContextResolver } from '../../src/runtime/elementContext'
import { createRuntimeElementRegistry } from '../../src/runtime/elementRegistry'

describe('runtime element context', () => {
  it('returns editable source context for project ids', () => {
    const element = {
      tagName: 'BUTTON',
      textContent: 'Save',
      attributes: [{ name: 'data-v-mcp-id', value: 'src/App.vue:2:3' }],
      getAttribute: (name: string) =>
        name === 'data-v-mcp-id' ? 'src/App.vue:2:3' : null,
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 100, height: 32 })
    } as unknown as Element

    const resolver = createElementContextResolver({
      root: '/repo/app',
      registry: createRuntimeElementRegistry(),
      querySelector: () => element
    })

    expect(resolver.getElementContext('src/App.vue:2:3')).toMatchObject({
      ok: true,
      editable: true,
      codeLocation: {
        file: 'src/App.vue',
        line: 2,
        column: 3
      },
      dom: {
        tag: 'button',
        text: 'Save'
      }
    })
  })

  it('returns a clear error for missing runtime ids', () => {
    const resolver = createElementContextResolver({
      root: '/repo/app',
      registry: createRuntimeElementRegistry(),
      querySelector: () => null
    })

    expect(resolver.getElementContext('runtime:vmcp_missing')).toEqual({
      ok: false,
      error: 'element not found',
      elementId: 'runtime:vmcp_missing',
      limitations: [
        'element was removed or page refreshed',
        'please ask the user to pick the element again'
      ]
    })
  })
})
