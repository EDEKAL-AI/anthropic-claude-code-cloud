// AES-256-GCM encryption for Baileys auth-state values at rest. The 32-byte master key
// is generated in the main process, protected there with Electron safeStorage (OS
// keychain), and handed to this worker on init. The worker never persists the key.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

export function encrypt(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  // layout: [iv | tag | ciphertext]
  return Buffer.concat([iv, tag, enc])
}

export function decrypt(blob: Buffer, key: Buffer): Buffer {
  const iv = blob.subarray(0, IV_LEN)
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const enc = blob.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()])
}
