import type { Database } from 'better-sqlite3'
import type { Template } from '@shared/models'

interface TemplateRow {
  id: number
  name: string
  body: string
  media_path: string | null
  media_type: string | null
  created_at: string
}

function toModel(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    mediaPath: row.media_path,
    mediaType: row.media_type,
    createdAt: row.created_at
  }
}

export class TemplatesRepo {
  constructor(private db: Database) {}

  list(): Template[] {
    return (this.db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all() as TemplateRow[]).map(
      toModel
    )
  }

  get(id: number): Template | null {
    const row = this.db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined
    return row ? toModel(row) : null
  }

  create(input: { name: string; body: string; mediaPath?: string; mediaType?: string }): Template {
    const now = new Date().toISOString()
    const info = this.db
      .prepare('INSERT INTO templates (name, body, media_path, media_type, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(input.name, input.body, input.mediaPath ?? null, input.mediaType ?? null, now)
    return this.get(Number(info.lastInsertRowid))!
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM templates WHERE id = ?').run(id)
  }
}
