import { describe, expect, it } from 'vitest'
import { maskHeaders, truncateText } from '../../src/shared/sanitize'

describe('sanitize helpers', () => {
  it('masks sensitive headers case-insensitively', () => {
    const result = maskHeaders(
      {
        Authorization: 'Bearer token',
        cookie: 'sid=1',
        'content-type': 'application/json'
      },
      ['authorization', 'cookie']
    )

    expect(result).toEqual({
      Authorization: '[masked]',
      cookie: '[masked]',
      'content-type': 'application/json'
    })
  })

  it('truncates long text and marks the result', () => {
    expect(truncateText('abcdef', 3)).toEqual({
      text: 'abc',
      truncated: true,
      originalLength: 6
    })
  })
})
