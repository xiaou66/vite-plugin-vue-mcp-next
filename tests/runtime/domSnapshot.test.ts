import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createDomSnapshot,
  queryDomElements
} from '../../src/runtime/domSnapshot'

class FakeNode {
  static readonly TEXT_NODE = 3
  readonly nodeName = 'fake-node'
}

class FakeElement extends FakeNode {
  readonly nodeType = 1
  readonly tagName: string
  readonly attributes: Array<{ name: string; value: string }>
  readonly childNodes: unknown[]
  readonly textContent: string

  constructor(options: {
    tagName: string
    attributes?: Array<{ name: string; value: string }>
    childNodes?: unknown[]
    textContent?: string
  }) {
    super()
    this.tagName = options.tagName.toUpperCase()
    this.attributes = options.attributes ?? []
    this.childNodes = options.childNodes ?? []
    this.textContent = options.textContent ?? ''
  }

  getBoundingClientRect() {
    return {
      toJSON: () => ({ x: 0, y: 0, width: 100, height: 20 })
    }
  }

  getAttribute(name: string) {
    return this.attributes.find((attr) => attr.name === name)?.value ?? null
  }
}

class FakeInputElement extends FakeElement {
  readonly type: string

  constructor(
    type: string,
    attributes: Array<{ name: string; value: string }>
  ) {
    super({ tagName: 'input', attributes })
    this.type = type
  }
}

class FakeTextNode extends FakeNode {
  readonly nodeType = 3
  readonly textContent: string

  constructor(textContent: string) {
    super()
    this.textContent = textContent
  }
}

const originalNode = globalThis.Node
const originalElement = globalThis.Element
const originalInputElement = globalThis.HTMLInputElement
const originalDocument = globalThis.document

describe('DOM snapshot', () => {
  beforeEach(() => {
    Object.assign(globalThis, {
      Node: FakeNode,
      Element: FakeElement,
      HTMLInputElement: FakeInputElement
    })
  })

  afterEach(() => {
    Object.assign(globalThis, {
      Node: originalNode,
      Element: originalElement,
      HTMLInputElement: originalInputElement,
      document: originalDocument
    })
  })

  it('skips script and hides password values', () => {
    const root = new FakeElement({
      tagName: 'main',
      attributes: [{ name: 'id', value: 'app' }],
      childNodes: [
        new FakeInputElement('password', [
          { name: 'type', value: 'password' },
          { name: 'value', value: 'secret' }
        ]),
        new FakeElement({
          tagName: 'button',
          attributes: [{ name: 'data-id', value: 'save' }],
          childNodes: [new FakeTextNode('Save')]
        }),
        new FakeElement({
          tagName: 'script',
          childNodes: [new FakeTextNode('window.bad = true')]
        })
      ]
    })

    const snapshot = createDomSnapshot(root as unknown as Element, {
      maxDepth: 5,
      maxNodes: 20,
      maxTextLength: 50
    })

    const text = JSON.stringify(snapshot)
    expect(text).toContain('button')
    expect(text).toContain('[masked]')
    expect(text).not.toContain('window.bad')
  })

  it('queries elements by selector', () => {
    const button = new FakeElement({ tagName: 'button', textContent: 'Save' })
    Object.assign(globalThis, {
      document: {
        querySelectorAll: (selector: string) =>
          selector === '.save' ? [button] : []
      }
    })

    expect(queryDomElements('.save', 5)).toEqual([
      expect.objectContaining({
        tag: 'button',
        text: 'Save'
      })
    ])
  })

  it('skips internal MCP overlay elements', () => {
    const overlay = new FakeElement({
      tagName: 'div',
      attributes: [{ name: 'data-v-mcp-internal', value: 'true' }],
      textContent: '元素位置已复制，请发送给 AI'
    })
    const root = new FakeElement({
      tagName: 'main',
      childNodes: [
        overlay,
        new FakeElement({ tagName: 'button', textContent: 'Save' })
      ]
    })

    const snapshot = createDomSnapshot(root as unknown as Element, {
      maxDepth: 5,
      maxNodes: 20,
      maxTextLength: 50
    })

    expect(JSON.stringify(snapshot)).toContain('Save')
    expect(JSON.stringify(snapshot)).not.toContain('元素位置已复制')
  })
})
