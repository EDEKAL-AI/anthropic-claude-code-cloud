// Offline license verification. A license token is `base64url(payloadJson).base64url(sig)`
// where `sig` is an Ed25519 signature over the payload bytes, produced by the vendor's
// private key. Verification needs no network — only the embedded public key.

import { verify as edVerify, createPublicKey } from 'node:crypto'
import { LICENSE_PUBLIC_KEY } from './public-key'
import type { LicenseInfo } from '@shared/models'

export type LicensePayload = LicenseInfo

export type VerifyResult =
  | { valid: true; payload: LicensePayload }
  | { valid: false; error: string }

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function isLicensePayload(value: unknown): value is LicensePayload {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    typeof p.sub === 'string' &&
    Number.isInteger(p.seats) &&
    (p.seats as number) >= 0 &&
    typeof p.iat === 'number' &&
    Number.isFinite(p.iat) &&
    typeof p.exp === 'number' &&
    Number.isFinite(p.exp) &&
    (p.exp as number) >= 0
  )
}

export function verifyLicense(token: string, publicKeyPem: string = LICENSE_PUBLIC_KEY): VerifyResult {
  const parts = token.trim().split('.')
  if (parts.length !== 2) return { valid: false, error: 'malformed license key' }

  let payloadBytes: Buffer
  let sig: Buffer
  try {
    payloadBytes = b64urlDecode(parts[0])
    sig = b64urlDecode(parts[1])
  } catch {
    return { valid: false, error: 'malformed license key' }
  }

  let signatureOk = false
  try {
    const key = createPublicKey(publicKeyPem)
    signatureOk = edVerify(null, payloadBytes, key, sig)
  } catch {
    return { valid: false, error: 'signature check failed' }
  }
  if (!signatureOk) return { valid: false, error: 'invalid signature' }

  let payload: LicensePayload
  try {
    const parsed: unknown = JSON.parse(payloadBytes.toString('utf8'))
    if (!isLicensePayload(parsed)) return { valid: false, error: 'invalid payload' }
    payload = parsed
  } catch {
    return { valid: false, error: 'invalid payload' }
  }

  if (payload.exp && payload.exp > 0 && Date.now() > payload.exp) {
    return { valid: false, error: 'license expired' }
  }

  return { valid: true, payload }
}
