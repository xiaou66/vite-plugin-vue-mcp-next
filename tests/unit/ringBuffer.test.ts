import { describe, expect, it } from 'vitest'
import { createRingBuffer } from '../../src/shared/ringBuffer'

describe('createRingBuffer', () => {
  it('keeps the latest records within capacity', () => {
    const buffer = createRingBuffer<number>(3)

    buffer.push(1)
    buffer.push(2)
    buffer.push(3)
    buffer.push(4)

    expect(buffer.all()).toEqual([2, 3, 4])
  })

  it('clears all records', () => {
    const buffer = createRingBuffer<string>(2)

    buffer.push('a')
    buffer.push('b')
    buffer.clear()

    expect(buffer.all()).toEqual([])
  })
})
