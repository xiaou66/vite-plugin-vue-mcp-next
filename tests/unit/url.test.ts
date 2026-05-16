import { describe, expect, it } from 'vitest'
import { parseRequestQuery, safeUrlPathname } from '../../src/shared/url'

describe('url helpers', () => {
  it('extracts repeated query params as arrays', () => {
    expect(parseRequestQuery('http://localhost/api?a=1&a=2&b=x')).toEqual({
      a: ['1', '2'],
      b: 'x'
    })
  })

  it('returns pathname for valid URLs and raw value for relative paths', () => {
    expect(safeUrlPathname('http://localhost:5173/admin/index.html')).toBe(
      '/admin/index.html'
    )
    expect(safeUrlPathname('/local/path')).toBe('/local/path')
  })
})
