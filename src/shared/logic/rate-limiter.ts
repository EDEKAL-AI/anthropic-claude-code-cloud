// Anti-ban pacing logic. Pure functions so they can be unit-tested without a socket.
//
// These encode the research-backed safeguards: randomized (gaussian-ish) inter-message
// delays, a batch break after a run of messages, a warmup ladder that gates the daily
// cap for new numbers, and circadian quiet hours.

export interface WarmupConfig {
  /** Cap on day 0 of warmup. */
  base: number
  /** Multiplicative growth per stage. */
  growth: number
  /** Hard ceiling regardless of warmup stage (safety max). */
  ceiling: number
}

export const DEFAULT_WARMUP: WarmupConfig = {
  base: 20,
  growth: 1.8,
  ceiling: 800
}

/** Daily cap allowed for a given warmup stage. */
export function dailyCapForStage(stage: number, cfg: WarmupConfig = DEFAULT_WARMUP): number {
  const raw = Math.round(cfg.base * Math.pow(cfg.growth, Math.max(0, stage)))
  return Math.min(raw, cfg.ceiling)
}

/**
 * Random delay in ms between two sends, drawn from [minMs, maxMs] with a mild
 * central bias (average of two uniforms) so timing is less robotic than flat uniform.
 */
export function nextDelayMs(minMs: number, maxMs: number, rng: () => number = Math.random): number {
  if (maxMs <= minMs) return Math.max(0, minMs)
  const u = (rng() + rng()) / 2 // triangular-ish, centered
  return Math.round(minMs + u * (maxMs - minMs))
}

export interface BatchBreakConfig {
  /** Take a longer pause after this many messages in a run. */
  every: number
  /** Length of the longer pause, in ms. */
  pauseMs: number
}

export const DEFAULT_BATCH_BREAK: BatchBreakConfig = {
  every: 100,
  pauseMs: 5 * 60_000
}

/** Whether a batch break is due given how many were sent so far in this run. */
export function isBatchBreakDue(sentInRun: number, cfg: BatchBreakConfig = DEFAULT_BATCH_BREAK): boolean {
  return sentInRun > 0 && sentInRun % cfg.every === 0
}

export interface QuietHours {
  /** Inclusive start hour [0-23] of the quiet window. */
  startHour: number
  /** Exclusive end hour [0-23] of the quiet window. */
  endHour: number
}

export const DEFAULT_QUIET_HOURS: QuietHours = { startHour: 2, endHour: 6 }

/** True if the given local hour falls inside the quiet (no-send) window. */
export function isQuietHour(hour: number, q: QuietHours = DEFAULT_QUIET_HOURS): boolean {
  if (q.startHour === q.endHour) return false
  if (q.startHour < q.endHour) {
    return hour >= q.startHour && hour < q.endHour
  }
  // window wraps past midnight
  return hour >= q.startHour || hour < q.endHour
}

/** Typing duration proportional to message length, clamped to a human range. */
export function typingDurationMs(textLength: number): number {
  const perChar = 60 // ~ slow human typist
  return Math.min(8000, Math.max(800, textLength * perChar))
}

export interface SendGateInput {
  dailySentCount: number
  warmupStage: number
  campaignDailyCap: number
  localHour: number
  warmup?: WarmupConfig
  quietHours?: QuietHours
}

export type SendGateResult =
  | { allowed: true }
  | { allowed: false; reason: 'daily-cap' | 'quiet-hours' }

/** Decide whether a send is permitted right now under all anti-ban gates. */
export function evaluateSendGate(input: SendGateInput): SendGateResult {
  if (isQuietHour(input.localHour, input.quietHours)) {
    return { allowed: false, reason: 'quiet-hours' }
  }
  const cap = Math.min(input.campaignDailyCap, dailyCapForStage(input.warmupStage, input.warmup))
  if (input.dailySentCount >= cap) {
    return { allowed: false, reason: 'daily-cap' }
  }
  return { allowed: true }
}
