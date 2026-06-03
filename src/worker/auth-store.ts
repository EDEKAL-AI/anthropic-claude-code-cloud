// SQLite-backed, encrypted Baileys auth state. Replaces useMultiFileAuthState (which the
// Baileys docs warn not to use in production). Each account worker owns ONE file, so the
// single-writer-per-file invariant holds and no Signal key op crosses the IPC boundary.
//
// Values are serialized with Baileys' BufferJSON (handles Buffers/typed arrays), then
// encrypted with AES-256-GCM using the master key supplied by the main process.

import Database from 'better-sqlite3'
import {
  initAuthCreds,
  BufferJSON,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap
} from '@whiskeysockets/baileys'
import { encrypt, decrypt } from './crypto'

export interface SqliteAuthState {
  state: AuthenticationState
  saveCreds: () => void
  /** Close the underlying SQLite connection. Call before reopening on reconnect. */
  close: () => void
}

export function useSqliteAuthState(dbFile: string, key: Buffer): SqliteAuthState {
  const db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.exec('CREATE TABLE IF NOT EXISTS auth (name TEXT PRIMARY KEY, data BLOB NOT NULL)')

  const readStmt = db.prepare('SELECT data FROM auth WHERE name = ?')
  const writeStmt = db.prepare(
    'INSERT INTO auth (name, data) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data'
  )
  const delStmt = db.prepare('DELETE FROM auth WHERE name = ?')

  function readData<T>(name: string): T | null {
    const row = readStmt.get(name) as { data: Buffer } | undefined
    if (!row) return null
    const json = decrypt(row.data, key).toString('utf8')
    return JSON.parse(json, BufferJSON.reviver) as T
  }

  function writeData(name: string, value: unknown): void {
    const json = JSON.stringify(value, BufferJSON.replacer)
    writeStmt.run(name, encrypt(Buffer.from(json, 'utf8'), key))
  }

  function removeData(name: string): void {
    delStmt.run(name)
  }

  const creds: AuthenticationCreds = readData<AuthenticationCreds>('creds') ?? initAuthCreds()

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data: { [id: string]: SignalDataTypeMap[typeof type] } = {}
        for (const id of ids) {
          let value = readData<SignalDataTypeMap[typeof type]>(`${type}-${id}`)
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value as object) as never
          }
          if (value) data[id] = value
        }
        return data
      },
      set: async (data) => {
        const tx = db.transaction(() => {
          for (const category in data) {
            const entries = data[category as keyof SignalDataTypeMap]!
            for (const id in entries) {
              const value = entries[id]
              const name = `${category}-${id}`
              if (value) writeData(name, value)
              else removeData(name)
            }
          }
        })
        tx()
      }
    }
  }

  return {
    state,
    saveCreds: () => writeData('creds', state.creds),
    close: () => db.close()
  }
}
