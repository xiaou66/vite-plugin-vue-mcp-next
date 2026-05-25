import { describe, expect, it } from 'vitest'
import { parseElementId } from '../../src/shared/elementId'

describe('elementId parser', () => {
  it('parses project source ids with file line and column', () => {
    expect(parseElementId('src/pages/Home.vue:12:8')).toEqual({
      kind: 'project-source',
      elementId: 'src/pages/Home.vue:12:8',
      file: 'src/pages/Home.vue',
      line: 12,
      column: 8
    })
  })

  it('parses third-party package ids', () => {
    expect(parseElementId('pkg:element-plus/Button')).toEqual({
      kind: 'package',
      elementId: 'pkg:element-plus/Button',
      packageName: 'element-plus',
      entryFile: 'Button'
    })
  })

  it('parses scoped package ids', () => {
    expect(parseElementId('pkg:@scope/ui/Button')).toEqual({
      kind: 'package',
      elementId: 'pkg:@scope/ui/Button',
      packageName: '@scope/ui',
      entryFile: 'Button'
    })
  })

  it('parses runtime fallback ids', () => {
    expect(parseElementId('runtime:vmcp_abc123')).toEqual({
      kind: 'runtime',
      elementId: 'runtime:vmcp_abc123',
      runtimeId: 'vmcp_abc123'
    })
  })

  it('returns invalid for unknown ids', () => {
    expect(parseElementId('button.save')).toEqual({
      kind: 'invalid',
      elementId: 'button.save',
      reason: 'unsupported elementId format'
    })
  })
})
