import { describe, expect, it } from 'vitest'
import { matchCdpTarget } from '../../src/cdp/targetMatcher'

describe('matchCdpTarget', () => {
  const targets = [
    {
      id: '1',
      type: 'page',
      url: 'http://localhost:5173/',
      title: 'Home',
      webSocketDebuggerUrl: 'ws://one'
    },
    {
      id: '2',
      type: 'page',
      url: 'http://localhost:5173/admin.html',
      title: 'Admin',
      webSocketDebuggerUrl: 'ws://two'
    }
  ]

  it('matches by exact runtime URL first', () => {
    expect(
      matchCdpTarget(targets, { url: 'http://localhost:5173/admin.html' })?.id
    ).toBe('2')
  })

  it('matches by targetUrlPattern when provided', () => {
    expect(matchCdpTarget(targets, { targetUrlPattern: /admin/ })?.id).toBe('2')
  })
})
