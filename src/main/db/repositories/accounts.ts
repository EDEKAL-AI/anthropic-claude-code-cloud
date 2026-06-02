import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Account, AccountStatus } from '@shared/models'

interface AccountRow {
  id: string
  phone: string
  label: string
  status: string
  pairing_method: string
  primary_kind: string
  warmup_stage: number
  daily_sent_count: number
  daily_window_start: string | null
  last_connected_at: string | null
  created_at: string
}

function toModel(row: AccountRow): Account {
  return {
    id: row.id,
    phone: row.phone,
    label: row.label,
    status: row.status as Account['status'],
    pairingMethod: row.pairing_method as Account['pairingMethod'],
    primaryKind: row.primary_kind as Account['primaryKind'],
    warmupStage: row.warmup_stage,
    dailySentCount: row.daily_sent_count,
    dailyWindowStart: row.daily_window_start,
    lastConnectedAt: row.last_connected_at,
    createdAt: row.created_at
  }
}

export class AccountsRepo {
  constructor(private db: Database) {}

  list(): Account[] {
    const rows = this.db.prepare('SELECT * FROM accounts ORDER BY created_at').all() as AccountRow[]
    return rows.map(toModel)
  }

  get(id: string): Account | null {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined
    return row ? toModel(row) : null
  }

  create(input: {
    phone: string
    label: string
    primaryKind: Account['primaryKind']
    pairingMethod: Account['pairingMethod']
  }): Account {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO accounts (id, phone, label, status, pairing_method, primary_kind, created_at)
         VALUES (?, ?, ?, 'unlinked', ?, ?, ?)`
      )
      .run(id, input.phone, input.label, input.pairingMethod, input.primaryKind, now)
    return this.get(id)!
  }

  setStatus(id: string, status: AccountStatus): void {
    const connectedAt = status === 'linked' ? new Date().toISOString() : null
    if (connectedAt) {
      this.db
        .prepare('UPDATE accounts SET status = ?, last_connected_at = ? WHERE id = ?')
        .run(status, connectedAt, id)
    } else {
      this.db.prepare('UPDATE accounts SET status = ? WHERE id = ?').run(status, id)
    }
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  }

  /**
   * Atomically reserves one send against the rolling 24h window, returning the new count,
   * or null if the window simply rolled over (resets to 1). Caller has already passed the
   * anti-ban gate; this only maintains the counter.
   */
  recordSend(id: string): void {
    const now = new Date()
    const account = this.get(id)
    if (!account) return
    const windowStart = account.dailyWindowStart ? new Date(account.dailyWindowStart) : null
    const rolledOver = !windowStart || now.getTime() - windowStart.getTime() > 24 * 60 * 60 * 1000
    if (rolledOver) {
      this.db
        .prepare('UPDATE accounts SET daily_sent_count = 1, daily_window_start = ? WHERE id = ?')
        .run(now.toISOString(), id)
    } else {
      this.db.prepare('UPDATE accounts SET daily_sent_count = daily_sent_count + 1 WHERE id = ?').run(id)
    }
  }

  setWarmupStage(id: string, stage: number): void {
    this.db.prepare('UPDATE accounts SET warmup_stage = ? WHERE id = ?').run(stage, id)
  }
}
