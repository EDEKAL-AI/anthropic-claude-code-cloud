import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, sign as edSign } from 'node:crypto'
import { verifyLicense } from './verify'
import { LicenseService } from './service'
import { openDb } from '../db/connection'
import { SettingsRepo } from '../db/repositories'

// A real license signed by the embedded public key's private counterpart (Demo Customer,
// 5 seats, expiring ~2027). Used to exercise the activated path without the signing key.
const SAMPLE_TOKEN =
  'eyJzdWIiOiJEZW1vIEN1c3RvbWVyIiwiZXhwIjoxODEyMDA4ODM1Mjg5LCJzZWF0cyI6NSwiaWF0IjoxNzgwNDcyODM1Mjg5fQ.ctAuxoFTJ8tDT_gukx3HBAsP3HCeKr1C0_Fs2ylJnKwubBjEFnt8GAIwq6WZGkgARIPoRxZ8GFFJuqCOloNPBQ'

function b64url(b: Buffer): string {
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function makeToken(payload: object, privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']): string {
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8')
  const sig = edSign(null, bytes, privateKey)
  return `${b64url(bytes)}.${b64url(sig)}`
}

describe('verifyLicense', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

  it('accepts a validly signed, non-expired license', () => {
    const token = makeToken({ sub: 'Acme', exp: 0, seats: 3, iat: Date.now() }, privateKey)
    const r = verifyLicense(token, pubPem)
    expect(r.valid).toBe(true)
    if (r.valid) expect(r.payload.sub).toBe('Acme')
  })

  it('rejects a tampered payload', () => {
    const token = makeToken({ sub: 'Acme', exp: 0, seats: 3, iat: Date.now() }, privateKey)
    const [, sig] = token.split('.')
    const forged = `${b64url(Buffer.from(JSON.stringify({ sub: 'Acme', exp: 0, seats: 9999, iat: Date.now() })))}.${sig}`
    expect(verifyLicense(forged, pubPem).valid).toBe(false)
  })

  it('rejects an expired license', () => {
    const token = makeToken({ sub: 'Acme', exp: Date.now() - 1000, seats: 3, iat: Date.now() - 2000 }, privateKey)
    const r = verifyLicense(token, pubPem)
    expect(r.valid).toBe(false)
  })

  it('rejects malformed input', () => {
    expect(verifyLicense('not-a-token', pubPem).valid).toBe(false)
    expect(verifyLicense('a.b.c', pubPem).valid).toBe(false)
  })

  it('rejects a license signed by a different key against the embedded key', () => {
    const token = makeToken({ sub: 'Acme', exp: 0, seats: 3, iat: Date.now() }, privateKey)
    // default (embedded) public key does not match this ephemeral private key
    expect(verifyLicense(token).valid).toBe(false)
  })

  it('rejects signed-but-malformed payloads', () => {
    expect(verifyLicense(makeToken({}, privateKey), pubPem).valid).toBe(false)
    expect(verifyLicense(makeToken({ sub: 'A', seats: -1, exp: 0, iat: 1 }, privateKey), pubPem).valid).toBe(false)
    expect(verifyLicense(makeToken({ sub: 'A', seats: 1.5, exp: 0, iat: 1 }, privateKey), pubPem).valid).toBe(false)
    expect(verifyLicense(makeToken({ sub: 'A', seats: 1, iat: 1 }, privateKey), pubPem).valid).toBe(false) // no exp
  })
})

describe('LicenseService', () => {
  function service(): LicenseService {
    return new LicenseService(new SettingsRepo(openDb(':memory:')))
  }

  it('reports unactivated state with null seats', () => {
    const svc = service()
    expect(svc.status().activated).toBe(false)
    expect(svc.seats()).toBeNull()
  })

  it('activates a valid token and exposes status + seats', () => {
    const svc = service()
    const res = svc.activate(SAMPLE_TOKEN)
    expect(res.ok).toBe(true)
    expect(svc.status().activated).toBe(true)
    expect(svc.status().payload?.sub).toBe('Demo Customer')
    expect(svc.seats()).toBe(5)
  })

  it('rejects an invalid token and stays unactivated', () => {
    const svc = service()
    const res = svc.activate('not-a-valid-token')
    expect(res.ok).toBe(false)
    expect(svc.status().activated).toBe(false)
    expect(svc.seats()).toBeNull()
  })
})
