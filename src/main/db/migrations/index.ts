import type { Database } from 'better-sqlite3'

// Ordered, idempotent migrations. Each entry's index+1 is its target `user_version`.
// On startup we apply every migration whose version is greater than the DB's current
// `PRAGMA user_version`, each inside an implicit transaction.

type Migration = { version: number; sql: string }

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'unlinked',
      pairing_method TEXT NOT NULL DEFAULT 'code',
      primary_kind TEXT NOT NULL DEFAULT 'emulator',
      warmup_stage INTEGER NOT NULL DEFAULT 0,
      daily_sent_count INTEGER NOT NULL DEFAULT 0,
      daily_window_start TEXT,
      last_connected_at TEXT,
      created_at TEXT NOT NULL
    );

    -- NOTE: Baileys auth state is NOT stored here. Each account worker owns its own
    -- encrypted SQLite file (sessions/<accountId>-auth.db) so the single-writer-per-file
    -- invariant holds and Signal key reads/writes never cross the IPC boundary.

    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      wa_jid TEXT,
      phone TEXT NOT NULL,
      name TEXT,
      opt_in INTEGER NOT NULL DEFAULT 0,
      opt_out INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (account_id, phone),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'list'
    );

    CREATE TABLE list_members (
      list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      PRIMARY KEY (list_id, contact_id)
    );

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE contact_tags (
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (contact_id, tag_id)
    );

    CREATE TABLE templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      media_path TEXT,
      media_type TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      template_id INTEGER NOT NULL REFERENCES templates(id),
      list_id INTEGER NOT NULL REFERENCES lists(id),
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TEXT,
      recurrence TEXT,
      rate_min_ms INTEGER NOT NULL DEFAULT 8000,
      rate_max_ms INTEGER NOT NULL DEFAULT 25000,
      daily_cap INTEGER NOT NULL DEFAULT 200,
      created_at TEXT NOT NULL
    );

    CREATE TABLE campaign_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_for TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      locked_at TEXT,
      sent_at TEXT,
      error TEXT,
      wa_message_id TEXT
    );
    CREATE INDEX idx_jobs_due ON campaign_jobs (status, scheduled_for);
    CREATE INDEX idx_jobs_campaign ON campaign_jobs (campaign_id);

    CREATE TABLE message_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      contact_id INTEGER,
      wa_message_id TEXT,
      body TEXT,
      media_path TEXT,
      status TEXT,
      ts TEXT NOT NULL
    );
    CREATE INDEX idx_logs_account ON message_logs (account_id, ts);
    CREATE UNIQUE INDEX idx_logs_wamid ON message_logs (account_id, direction, wa_message_id)
      WHERE wa_message_id IS NOT NULL;

    CREATE TABLE auto_reply_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      match_type TEXT NOT NULL DEFAULT 'contains',
      keyword TEXT,
      template_id INTEGER NOT NULL REFERENCES templates(id),
      enabled INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Per-contact auto-reply cooldown bookkeeping.
    CREATE TABLE auto_reply_state (
      account_id TEXT NOT NULL,
      contact_id INTEGER NOT NULL,
      last_replied_at TEXT NOT NULL,
      PRIMARY KEY (account_id, contact_id)
    );
    `
  }
]

export function runMigrations(db: Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (const migration of MIGRATIONS) {
    if (migration.version > current) {
      const tx = db.transaction(() => {
        db.exec(migration.sql)
        db.pragma(`user_version = ${migration.version}`)
      })
      tx()
    }
  }
}

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version
