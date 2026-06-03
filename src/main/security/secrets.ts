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

  const encAvailable = safeStorage.isEncryptionAvailable()

  // 1. Prefer an existing encrypted key.
  const stored = settings.get(SETTING_KEY)
  if (stored && encAvailable) {
    const keyB64 = safeStorage.decryptString(Buffer.from(stored, 'base64'))
    cached = Buffer.from(keyB64, 'base64')
    return cached
  }

  // 2. Fall back to a plaintext key from a prior keyring-less run. Load it regardless of
  //    whether encryption is now available — rotating it here would orphan existing auth
  //    blobs encrypted with it. If encryption has since become available, migrate it.
  const plain = settings.get(SETTING_PLAINTEXT_KEY)
  if (plain) {
    cached = Buffer.from(plain, 'base64')
    if (encAvailable) {
      settings.set(SETTING_KEY, safeStorage.encryptString(plain).toString('base64'))
      settings.set(SETTING_PLAINTEXT_KEY, '')
    }
    return cached
  }

  // 3. No key yet: generate one and store it as securely as the platform allows.
  const key = randomBytes(32)
  if (encAvailable) {
    settings.set(SETTING_KEY, safeStorage.encryptString(key.toString('base64')).toString('base64'))
  } else {
    settings.set(SETTING_PLAINTEXT_KEY, key.toString('base64'))
  }
  cached = key
  return cached
}
