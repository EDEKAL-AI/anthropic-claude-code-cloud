import type { Database } from 'better-sqlite3'
import type { Campaign, CampaignJob, CampaignStatus, JobStatus } from '@shared/models'

interface CampaignRow {
  id: number
  account_id: string
  name: string
  template_id: number
  list_id: number
  status: string
  scheduled_at: string | null
  recurrence: string | null
  rate_min_ms: number
  rate_max_ms: number
  daily_cap: number
  created_at: string
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    templateId: row.template_id,
    listId: row.list_id,
    status: row.status as CampaignStatus,
    scheduledAt: row.scheduled_at,
    recurrence: row.recurrence,
    rateMinMs: row.rate_min_ms,
    rateMaxMs: row.rate_max_ms,
    dailyCap: row.daily_cap,
    createdAt: row.created_at
  }
}

interface JobRow {
  id: number
  campaign_id: number
  contact_id: number
  status: string
  scheduled_for: string
  attempts: number
  locked_at: string | null
  sent_at: string | null
  error: string | null
  wa_message_id: string | null
}

function toJob(row: JobRow): CampaignJob {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    contactId: row.contact_id,
    status: row.status as JobStatus,
    scheduledFor: row.scheduled_for,
    attempts: row.attempts,
    lockedAt: row.locked_at,
    sentAt: row.sent_at,
    error: row.error,
    waMessageId: row.wa_message_id
  }
}

export class CampaignsRepo {
  constructor(private db: Database) {}

  list(): Campaign[] {
    return (this.db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all() as CampaignRow[]).map(
      toCampaign
    )
  }

  get(id: number): Campaign | null {
    const row = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as CampaignRow | undefined
    return row ? toCampaign(row) : null
  }

  create(input: {
    accountId: string
    name: string
    templateId: number
    listId: number
    scheduledAt: string | null
    recurrence: string | null
    rateMinMs: number
    rateMaxMs: number
    dailyCap: number
  }): Campaign {
    const now = new Date().toISOString()
    const status: CampaignStatus = input.scheduledAt ? 'scheduled' : 'running'
    const info = this.db
      .prepare(
        `INSERT INTO campaigns
         (account_id, name, template_id, list_id, status, scheduled_at, recurrence, rate_min_ms, rate_max_ms, daily_cap, created_at)
         VALUES (@accountId, @name, @templateId, @listId, @status, @scheduledAt, @recurrence, @rateMinMs, @rateMaxMs, @dailyCap, @now)`
      )
      .run({ ...input, status, now })
    return this.get(Number(info.lastInsertRowid))!
  }

  setStatus(id: number, status: CampaignStatus): void {
    this.db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(status, id)
  }

  // ---- jobs ----

  /** Inserts the materialized jobs for a campaign in one transaction. */
  insertJobs(jobs: { campaignId: number; contactId: number; scheduledFor: string }[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO campaign_jobs (campaign_id, contact_id, status, scheduled_for)
       VALUES (?, ?, 'pending', ?)`
    )
    const tx = this.db.transaction((rows: typeof jobs) => {
      for (const j of rows) stmt.run(j.campaignId, j.contactId, j.scheduledFor)
    })
    tx(jobs)
  }

  /**
   * Atomically claims up to `limit` due jobs for an account: selects pending jobs whose
   * time has come (from running campaigns) and flips them to 'running' with a lock
   * timestamp, so a crash mid-send can be reconciled later.
   */
  claimDueJobs(accountId: string, nowIso: string, limit: number): CampaignJob[] {
    const claim = this.db.transaction(() => {
      const rows = this.db
        .prepare(
          `SELECT j.* FROM campaign_jobs j
           JOIN campaigns c ON c.id = j.campaign_id
           WHERE c.account_id = ? AND c.status = 'running'
             AND j.status = 'pending' AND j.scheduled_for <= ?
           ORDER BY j.scheduled_for
           LIMIT ?`
        )
        .all(accountId, nowIso, limit) as JobRow[]
      const upd = this.db.prepare(
        "UPDATE campaign_jobs SET status = 'running', locked_at = ? WHERE id = ?"
      )
      for (const r of rows) upd.run(nowIso, r.id)
      return rows.map(toJob)
    })
    return claim()
  }

  markJob(id: number, status: JobStatus, fields: { waMessageId?: string; error?: string } = {}): void {
    const sentAt = status === 'sent' ? new Date().toISOString() : null
    this.db
      .prepare(
        `UPDATE campaign_jobs
         SET status = ?, attempts = attempts + 1, locked_at = NULL,
             sent_at = COALESCE(?, sent_at), wa_message_id = COALESCE(?, wa_message_id), error = ?
         WHERE id = ?`
      )
      .run(status, sentAt, fields.waMessageId ?? null, fields.error ?? null, id)
  }

  /** Reclaims jobs stuck in 'running' (crash orphans) past the lease, back to 'pending'. */
  reconcileStuckJobs(leaseMs: number): number {
    const cutoff = new Date(Date.now() - leaseMs).toISOString()
    const info = this.db
      .prepare(
        "UPDATE campaign_jobs SET status = 'pending', locked_at = NULL WHERE status = 'running' AND locked_at < ?"
      )
      .run(cutoff)
    return info.changes
  }

  progress(campaignId: number): { total: number; sent: number; failed: number; pending: number } {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status IN ('sent','delivered','read') THEN 1 ELSE 0 END) AS sent,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN status IN ('pending','running') THEN 1 ELSE 0 END) AS pending
         FROM campaign_jobs WHERE campaign_id = ?`
      )
      .get(campaignId) as { total: number; sent: number; failed: number; pending: number }
    return {
      total: row.total ?? 0,
      sent: row.sent ?? 0,
      failed: row.failed ?? 0,
      pending: row.pending ?? 0
    }
  }

  /** Campaigns that still have pending work, used by the scheduler to know who to poll. */
  accountsWithPendingJobs(): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT c.account_id AS accountId
         FROM campaigns c JOIN campaign_jobs j ON j.campaign_id = c.id
         WHERE c.status = 'running' AND j.status = 'pending'`
      )
      .all() as { accountId: string }[]
    return rows.map((r) => r.accountId)
  }
}
