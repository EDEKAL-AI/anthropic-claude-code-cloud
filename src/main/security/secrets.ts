// Master key management. A single 32-byte AES key encrypts every account's auth store.
// At rest the key itself is protected by Electron safeStorage (OS keychain). The raw key
// is only held in main-process memory and passed to each worker over IPC on init.

import { safeStorage } from 'electron'
import { randomBytes } from 'node:crypto'
import type { SettingsRepo } from '../db/repositories'

const SETTING_KEY = 'masterKeyEnc'
const SETTING_PLAINTEXT_KEY = 'masterKeyPlain' // fallback only

let cached: Buffer | null = null

export function getMasterKey(settings: SettingsRepo): Buffer {
  if (cached) return cached

  const stored = settings.get(SETTING_KEY)
  if (stored && safeStorage.isEncryptionAvailable()) {
    const keyB64 = safeStorage.decryptString(Buffer.from(stored, 'base64'))
    cached = Buffer.from(keyB64, 'base64')
    return cached
  }

  // Fallback path for environments without an OS keyring (e.g. headless Linux). The key
  // is stored unencrypted; this is clearly worse and surfaced via the setting name.
  const plain = settings.get(SETTING_PLAINTEXT_KEY)
  if (plain && !safeStorage.isEncryptionAvailable()) {
    cached = Buffer.from(plain, 'base64')
    return cached
  }

  // Generate a fresh key.
  const key = randomBytes(32)
  if (safeStorage.isEncryptionAvailable()) {
    const enc = safeStorage.encryptString(key.toString('base64'))
    settings.set(SETTING_KEY, enc.toString('base64'))
  } else {
    settings.set(SETTING_PLAINTEXT_KEY, key.toString('base64'))
  }
  cached = key
  return cached
}
