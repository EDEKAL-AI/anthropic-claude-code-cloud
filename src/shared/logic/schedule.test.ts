import { describe, it, expect } from 'vitest'
import { materializeJobs } from './schedule'
import { isOptOutMessage } from './optout'

// Deterministic rng for reproducible tests. Must stay in [0, 1) like Math.random — dividing
// by 0x80000000 (not 0x7fffffff) guarantees the result never reaches 1.
function seededRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x80000000
  }
}

describe('materializeJobs', () => {
  it('creates one job per contact', () => {
    const jobs = materializeJobs({
      contactIds: [1, 2, 3, 4, 5],
      startAt: 1_000_000,
      rateMinMs: 1000,
      rateMaxMs: 2000,
      rng: seededRng(42)
    })
    expect(jobs).toHaveLength(5)
    expect(jobs.map((j) => j.contactId).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it('schedules in strictly increasing time order', () => {
    const jobs = materializeJobs({
      contactIds: [1, 2, 3, 4, 5],
      startAt: 0,
      rateMinMs: 1000,
      rateMaxMs: 2000,
      rng: seededRng(7)
    })
    for (let i = 1; i < jobs.length; i++) {
      expect(jobs[i].scheduledForMs).toBeGreaterThan(jobs[i - 1].scheduledForMs)
    }
  })

  it('inserts a batch break after `every` messages', () => {
    const jobs = materializeJobs({
      contactIds: Array.from({ length: 6 }, (_, i) => i + 1),
      startAt: 0,
      rateMinMs: 10,
      rateMaxMs: 10,
      batchBreak: { every: 3, pauseMs: 100_000 },
      rng: seededRng(1)
    })
    // gap between job 3 and job 4 should include the batch pause
    const gap = jobs[3].scheduledForMs - jobs[2].scheduledForMs
    expect(gap).toBeGreaterThanOrEqual(100_000)
  })
})

describe('isOptOutMessage', () => {
  it('detects English stop words', () => {
    expect(isOptOutMessage('STOP')).toBe(true)
    expect(isOptOutMessage('please unsubscribe me')).toBe(true)
  })

  it('detects Hebrew stop words', () => {
    expect(isOptOutMessage('הסר')).toBe(true)
  })

  it('ignores normal messages', () => {
    expect(isOptOutMessage('what is the price?')).toBe(false)
    expect(isOptOutMessage('')).toBe(false)
  })

  it('does not false-positive on words/phrases that merely contain a stop word', () => {
    expect(isOptOutMessage('unstoppable')).toBe(false)
    expect(isOptOutMessage('bus stop')).toBe(false)
    expect(isOptOutMessage('baja california')).toBe(false)
    expect(isOptOutMessage('StoPper')).toBe(false)
  })

  it('still matches a bare stop word regardless of case/punctuation', () => {
    expect(isOptOutMessage('  STOP! ')).toBe(true)
  })
})
