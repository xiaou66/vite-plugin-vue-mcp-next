import { describe, expect, it } from 'vitest'
import { locateVueComponentForElement } from '../../src/runtime/vueComponentLocator'

describe('vue component locator', () => {
  it('returns project component ownership from Vue runtime metadata', () => {
    const element = {
      __vueParentComponent: {
        type: {
          name: 'HeroCard',
          __file: '/repo/app/src/components/HeroCard.vue'
        }
      }
    } as unknown as Element

    expect(locateVueComponentForElement(element, '/repo/app')).toEqual({
      name: 'HeroCard',
      source: {
        file: 'src/components/HeroCard.vue'
      },
      packageLocation: undefined
    })
  })

  it('returns package ownership for node_modules components', () => {
    const element = {
      __vueParentComponent: {
        type: {
          name: 'ElButton',
          __file:
            '/repo/app/node_modules/element-plus/es/components/button/src/button.vue'
        }
      }
    } as unknown as Element

    expect(locateVueComponentForElement(element, '/repo/app')).toEqual({
      name: 'ElButton',
      source: undefined,
      packageLocation: {
        packageName: 'element-plus',
        entryFile: 'es/components/button/src/button.vue'
      }
    })
  })
})
