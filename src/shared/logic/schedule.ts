// Campaign job materialization: turn a recipient list into individual job rows, each
// with its own `scheduledFor` timestamp spread out by randomized delays. Pure function
// (rng + clock injected) so it can be unit-tested deterministically.

import { nextDelayMs, isBatchBreakDue, DEFAULT_BATCH_BREAK, type BatchBreakConfig } from './rate-limiter'

export interface MaterializeInput {
  contactIds: number[]
  /** Epoch ms of the earliest send (campaign start). */
  startAt: number
  rateMinMs: number
  rateMaxMs: number
  batchBreak?: BatchBreakConfig
  rng?: () => number
}

export interface MaterializedJob {
  contactId: number
  scheduledForMs: number
}

/**
 * Spreads sends starting at `startAt`, advancing the cursor by a randomized delay per
 * recipient and inserting a longer batch break every N messages. The recipient order is
 * shuffled (Fisher–Yates with injected rng) so timing/order are not robotic.
 */
export function materializeJobs(input: MaterializeInput): MaterializedJob[] {
  const rng = input.rng ?? Math.random
  const batch = input.batchBreak ?? DEFAULT_BATCH_BREAK

  const order = [...input.contactIds]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  const jobs: MaterializedJob[] = []
  let cursor = input.startAt
  let sentInRun = 0

  for (const contactId of order) {
    jobs.push({ contactId, scheduledForMs: cursor })
    sentInRun++
    cursor += nextDelayMs(input.rateMinMs, input.rateMaxMs, rng)
    if (isBatchBreakDue(sentInRun, batch)) {
      cursor += batch.pauseMs
    }
  }

  return jobs
}
