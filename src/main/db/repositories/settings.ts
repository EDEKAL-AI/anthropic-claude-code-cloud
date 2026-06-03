import type { Database } from 'better-sqlite3'

export class SettingsRepo {
  constructor(private db: Database) {}

  get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string | null }
      | undefined
    return row?.value ?? null
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value)
  }

  all(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string | null
    }[]
    const out: Record<string, string> = {}
    for (const r of rows) if (r.value != null) out[r.key] = r.value
    return out
  }

  getNumber(key: string, fallback: number): number {
    const v = this.get(key)
    if (v == null) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
}
