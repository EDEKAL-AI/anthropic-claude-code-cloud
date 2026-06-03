import type { Database } from 'better-sqlite3'
import type { Contact, ContactList } from '@shared/models'

interface ContactRow {
  id: number
  account_id: string | null
  wa_jid: string | null
  phone: string
  name: string | null
  opt_in: number
  opt_out: number
  notes: string | null
  created_at: string
}

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    accountId: row.account_id,
    waJid: row.wa_jid,
    phone: row.phone,
    name: row.name,
    optIn: !!row.opt_in,
    optOut: !!row.opt_out,
    notes: row.notes,
    createdAt: row.created_at
  }
}

/** Strip everything but digits — WhatsApp identifiers are E.164 digits only. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '')
}

/**
 * Parse a single CSV line into fields, honouring double-quoted fields (which may contain
 * commas) and escaped quotes (""). Sufficient for contact imports where rows do not span
 * multiple physical lines.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  fields.push(field)
  return fields
}

export class ContactsRepo {
  constructor(private db: Database) {}

  list(accountId?: string): Contact[] {
    const rows = accountId
      ? (this.db
          .prepare('SELECT * FROM contacts WHERE account_id = ? OR account_id IS NULL ORDER BY name')
          .all(accountId) as ContactRow[])
      : (this.db.prepare('SELECT * FROM contacts ORDER BY name').all() as ContactRow[])
    return rows.map(toContact)
  }

  get(id: number): Contact | null {
    const row = this.db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as ContactRow | undefined
    return row ? toContact(row) : null
  }

  findByPhone(accountId: string | null, phone: string): Contact | null {
    const row = this.db
      .prepare('SELECT * FROM contacts WHERE account_id IS ? AND phone = ?')
      .get(accountId, normalizePhone(phone)) as ContactRow | undefined
    return row ? toContact(row) : null
  }

  upsert(input: { accountId: string | null; phone: string; name?: string | null; optIn?: boolean }): Contact {
    const phone = normalizePhone(input.phone)
    const now = new Date().toISOString()

    // SQLite treats NULLs as distinct in UNIQUE(account_id, phone), so ON CONFLICT does not
    // dedupe global (account_id IS NULL) contacts. Handle that case with an explicit
    // find-then-update; account-scoped rows use the upsert path.
    if (input.accountId === null) {
      const existing = this.findByPhone(null, phone)
      if (existing) {
        if (input.name != null) {
          this.db.prepare('UPDATE contacts SET name = ? WHERE id = ?').run(input.name, existing.id)
        }
        return this.findByPhone(null, phone)!
      }
      this.db
        .prepare(
          `INSERT INTO contacts (account_id, phone, name, opt_in, created_at)
           VALUES (NULL, @phone, @name, @optIn, @now)`
        )
        .run({ phone, name: input.name ?? null, optIn: input.optIn ? 1 : 0, now })
      return this.findByPhone(null, phone)!
    }

    this.db
      .prepare(
        `INSERT INTO contacts (account_id, phone, name, opt_in, created_at)
         VALUES (@accountId, @phone, @name, @optIn, @now)
         ON CONFLICT(account_id, phone) DO UPDATE SET
           name = COALESCE(excluded.name, contacts.name)`
      )
      .run({
        accountId: input.accountId,
        phone,
        name: input.name ?? null,
        optIn: input.optIn ? 1 : 0,
        now
      })
    return this.findByPhone(input.accountId, phone)!
  }

  /** Bulk import from CSV text. Expects header row with at least `phone`, optional `name`. */
  importCsv(csv: string, accountId: string | null): number {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length === 0) return 0
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
    const phoneIdx = header.indexOf('phone')
    const nameIdx = header.indexOf('name')
    if (phoneIdx === -1) throw new Error('CSV must have a "phone" column')

    const insert = this.db.transaction((rows: string[]) => {
      let count = 0
      for (const line of rows) {
        const cols = parseCsvLine(line)
        const phone = normalizePhone(cols[phoneIdx] ?? '')
        if (!phone) continue
        const name = nameIdx >= 0 ? (cols[nameIdx] ?? '').trim() || null : null
        this.upsert({ accountId, phone, name })
        count++
      }
      return count
    })
    return insert(lines.slice(1))
  }

  setOptOut(contactId: number, optOut: boolean): void {
    this.db.prepare('UPDATE contacts SET opt_out = ? WHERE id = ?').run(optOut ? 1 : 0, contactId)
  }

  setOptOutByPhone(accountId: string | null, phone: string): void {
    this.db
      .prepare('UPDATE contacts SET opt_out = 1 WHERE account_id IS ? AND phone = ?')
      .run(accountId, normalizePhone(phone))
  }
}

interface ListRow {
  id: number
  name: string
  type: string
}

export class ListsRepo {
  constructor(private db: Database) {}

  list(): ContactList[] {
    return (this.db.prepare('SELECT * FROM lists ORDER BY name').all() as ListRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type as ContactList['type']
    }))
  }

  create(name: string, type: ContactList['type']): ContactList {
    const info = this.db.prepare('INSERT INTO lists (name, type) VALUES (?, ?)').run(name, type)
    return { id: Number(info.lastInsertRowid), name, type }
  }

  addMembers(listId: number, contactIds: number[]): void {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO list_members (list_id, contact_id) VALUES (?, ?)'
    )
    const tx = this.db.transaction((ids: number[]) => {
      for (const id of ids) stmt.run(listId, id)
    })
    tx(contactIds)
  }

  /** Returns the sendable contacts of a list: not opted out. */
  membersForSend(listId: number): Contact[] {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM contacts c
         JOIN list_members m ON m.contact_id = c.id
         WHERE m.list_id = ? AND c.opt_out = 0`
      )
      .all(listId) as ContactRow[]
    return rows.map(toContact)
  }
}
