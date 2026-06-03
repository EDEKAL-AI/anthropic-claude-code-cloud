import type { Database } from 'better-sqlite3'
import type { AutoReplyRule, MatchType } from '@shared/models'

interface RuleRow {
  id: number
  account_id: string
  match_type: string
  keyword: string | null
  template_id: number
  enabled: number
  priority: number
}

function toModel(row: RuleRow): AutoReplyRule {
  return {
    id: row.id,
    accountId: row.account_id,
    matchType: row.match_type as MatchType,
    keyword: row.keyword,
    templateId: row.template_id,
    enabled: !!row.enabled,
    priority: row.priority
  }
}

export class AutoReplyRepo {
  constructor(private db: Database) {}

  list(accountId: string): AutoReplyRule[] {
    return (
      this.db
        .prepare('SELECT * FROM auto_reply_rules WHERE account_id = ? ORDER BY priority')
        .all(accountId) as RuleRow[]
    ).map(toModel)
  }

  create(input: Omit<AutoReplyRule, 'id'>): AutoReplyRule {
    const info = this.db
      .prepare(
        `INSERT INTO auto_reply_rules (account_id, match_type, keyword, template_id, enabled, priority)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.accountId,
        input.matchType,
        input.keyword,
        input.templateId,
        input.enabled ? 1 : 0,
        input.priority
      )
    const row = this.db
      .prepare('SELECT * FROM auto_reply_rules WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as RuleRow
    return toModel(row)
  }

  delete(ruleId: number): void {
    this.db.prepare('DELETE FROM auto_reply_rules WHERE id = ?').run(ruleId)
  }

  // ---- per-contact cooldown ----

  /** Returns ISO timestamp of the last auto-reply to a contact, or null. */
  lastRepliedAt(accountId: string, contactId: number): string | null {
    const row = this.db
      .prepare('SELECT last_replied_at FROM auto_reply_state WHERE account_id = ? AND contact_id = ?')
      .get(accountId, contactId) as { last_replied_at: string } | undefined
    return row?.last_replied_at ?? null
  }

  recordReply(accountId: string, contactId: number): void {
    this.db
      .prepare(
        `INSERT INTO auto_reply_state (account_id, contact_id, last_replied_at)
         VALUES (?, ?, ?)
         ON CONFLICT(account_id, contact_id) DO UPDATE SET last_replied_at = excluded.last_replied_at`
      )
      .run(accountId, contactId, new Date().toISOString())
  }
}
