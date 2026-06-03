import type { Database } from 'better-sqlite3'
import type { MessageDirection, MessageLog } from '@shared/models'

interface MessageRow {
  id: number
  account_id: string
  direction: string
  contact_id: number | null
  wa_message_id: string | null
  body: string | null
  media_path: string | null
  status: string | null
  ts: string
}

function toModel(row: MessageRow): MessageLog {
  return {
    id: row.id,
    accountId: row.account_id,
    direction: row.direction as MessageDirection,
    contactId: row.contact_id,
    waMessageId: row.wa_message_id,
    body: row.body,
    mediaPath: row.media_path,
    status: row.status,
    ts: row.ts
  }
}

export class MessagesRepo {
  constructor(private db: Database) {}

  list(accountId: string, limit = 200): MessageLog[] {
    return (
      this.db
        .prepare('SELECT * FROM message_logs WHERE account_id = ? ORDER BY ts DESC LIMIT ?')
        .all(accountId, limit) as MessageRow[]
    ).map(toModel)
  }

  /** Insert a log row. Duplicate inbound/outbound wa_message_id is ignored (dedup). */
  log(input: {
    accountId: string
    direction: MessageDirection
    contactId?: number | null
    waMessageId?: string | null
    body?: string | null
    mediaPath?: string | null
    status?: string | null
  }): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO message_logs
         (account_id, direction, contact_id, wa_message_id, body, media_path, status, ts)
         VALUES (@accountId, @direction, @contactId, @waMessageId, @body, @mediaPath, @status, @ts)`
      )
      .run({
        accountId: input.accountId,
        direction: input.direction,
        contactId: input.contactId ?? null,
        waMessageId: input.waMessageId ?? null,
        body: input.body ?? null,
        mediaPath: input.mediaPath ?? null,
        status: input.status ?? null,
        ts: new Date().toISOString()
      })
  }

  updateStatusByWaId(accountId: string, waMessageId: string, status: string): void {
    this.db
      .prepare(
        "UPDATE message_logs SET status = ? WHERE account_id = ? AND direction = 'out' AND wa_message_id = ?"
      )
      .run(status, accountId, waMessageId)
  }
}
