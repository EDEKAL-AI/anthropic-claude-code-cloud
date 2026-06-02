import { describe, it, expect } from 'vitest'
import {
  dailyCapForStage,
  nextDelayMs,
  isBatchBreakDue,
  isQuietHour,
  evaluateSendGate,
  typingDurationMs,
  DEFAULT_WARMUP
} from './rate-limiter'

describe('dailyCapForStage', () => {
  it('starts low and grows with stage', () => {
    expect(dailyCapForStage(0)).toBe(DEFAULT_WARMUP.base)
    expect(dailyCapForStage(1)).toBeGreaterThan(dailyCapForStage(0))
  })

  it('never exceeds the ceiling', () => {
    expect(dailyCapForStage(100)).toBe(DEFAULT_WARMUP.ceiling)
  })
})

describe('nextDelayMs', () => {
  it('stays within bounds', () => {
    for (let i = 0; i < 1000; i++) {
      const d = nextDelayMs(3000, 8000)
      expect(d).toBeGreaterThanOrEqual(3000)
      expect(d).toBeLessThanOrEqual(8000)
    }
  })

  it('returns the floor when min >= max', () => {
    expect(nextDelayMs(5000, 5000)).toBe(5000)
  })
})

describe('isBatchBreakDue', () => {
  it('fires every N messages but not at zero', () => {
    expect(isBatchBreakDue(0, { every: 100, pauseMs: 1 })).toBe(false)
    expect(isBatchBreakDue(100, { every: 100, pauseMs: 1 })).toBe(true)
    expect(isBatchBreakDue(150, { every: 100, pauseMs: 1 })).toBe(false)
    expect(isBatchBreakDue(200, { every: 100, pauseMs: 1 })).toBe(true)
  })
})

describe('isQuietHour', () => {
  it('detects a non-wrapping window', () => {
    expect(isQuietHour(3, { startHour: 2, endHour: 6 })).toBe(true)
    expect(isQuietHour(6, { startHour: 2, endHour: 6 })).toBe(false)
    expect(isQuietHour(1, { startHour: 2, endHour: 6 })).toBe(false)
  })

  it('detects a window that wraps past midnight', () => {
    expect(isQuietHour(23, { startHour: 22, endHour: 6 })).toBe(true)
    expect(isQuietHour(3, { startHour: 22, endHour: 6 })).toBe(true)
    expect(isQuietHour(12, { startHour: 22, endHour: 6 })).toBe(false)
  })
})

describe('evaluateSendGate', () => {
  it('blocks during quiet hours', () => {
    const r = evaluateSendGate({
      dailySentCount: 0,
      warmupStage: 5,
      campaignDailyCap: 100,
      localHour: 3
    })
    expect(r).toEqual({ allowed: false, reason: 'quiet-hours' })
  })

  it('blocks when the effective daily cap is reached', () => {
    const r = evaluateSendGate({
      dailySentCount: 20,
      warmupStage: 0, // cap = 20
      campaignDailyCap: 1000,
      localHour: 12
    })
    expect(r).toEqual({ allowed: false, reason: 'daily-cap' })
  })

  it('allows a normal send within limits', () => {
    const r = evaluateSendGate({
      dailySentCount: 5,
      warmupStage: 3,
      campaignDailyCap: 1000,
      localHour: 12
    })
    expect(r.allowed).toBe(true)
  })

  it('uses the lower of campaign cap and warmup cap', () => {
    const r = evaluateSendGate({
      dailySentCount: 5,
      warmupStage: 10, // warmup cap high
      campaignDailyCap: 5, // campaign cap is the binding constraint
      localHour: 12
    })
    expect(r).toEqual({ allowed: false, reason: 'daily-cap' })
  })
})

describe('typingDurationMs', () => {
  it('clamps to a human range', () => {
    expect(typingDurationMs(0)).toBe(800)
    expect(typingDurationMs(100000)).toBe(8000)
  })
})
