import { join } from 'node:path'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

let db: Database.Database | null = null

/**
 * Opens (once) the single application database. better-sqlite3 is synchronous; we keep
 * exactly one connection owned by the main process (single writer) to avoid SQLite lock
 * contention from the per-account workers, which never open the DB directly.
 *
 * `electron` is required lazily so this module can be imported by Node-based unit tests
 * (which call openDb) without pulling in the Electron runtime.
 */
export function getDb(): Database.Database {
  if (db) return db
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as typeof import('electron')
  const dir = app.getPath('userData')
  const file = join(dir, 'app.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  runMigrations(db)
  return db
}

/** For tests / explicit teardown. */
export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

/** Open an in-memory or file DB directly (used by unit/integration tests). */
export function openDb(file = ':memory:'): Database.Database {
  const conn = new Database(file)
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')
  runMigrations(conn)
  return conn
}
