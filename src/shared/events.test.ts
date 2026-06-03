import { describe, it, expect } from 'vitest'
import { isWorkerResponse, isWorkerEvent } from './events'

describe('isWorkerResponse', () => {
  it('accepts a response shape (has id + ok)', () => {
    expect(isWorkerResponse({ id: '1', ok: true })).toBe(true)
    expect(isWorkerResponse({ id: '1', ok: false, error: 'x' })).toBe(true)
  })

  it('rejects events, primitives, null, and partial shapes', () => {
    expect(isWorkerResponse({ type: 'qr', accountId: 'a', qr: 'x' })).toBe(false)
    expect(isWorkerResponse(null)).toBe(false)
    expect(isWorkerResponse(42)).toBe(false)
    expect(isWorkerResponse({ id: '1' })).toBe(false) // missing ok
  })
})

describe('isWorkerEvent', () => {
  it('accepts an event shape (has type, no ok)', () => {
    expect(isWorkerEvent({ type: 'status', accountId: 'a', status: 'linked' })).toBe(true)
  })

  it('rejects responses, primitives, null, and ambiguous shapes', () => {
    expect(isWorkerEvent({ id: '1', ok: true })).toBe(false)
    expect(isWorkerEvent({ type: 'x', ok: true })).toBe(false) // has ok -> treated as response
    expect(isWorkerEvent(null)).toBe(false)
    expect(isWorkerEvent('nope')).toBe(false)
  })
})
