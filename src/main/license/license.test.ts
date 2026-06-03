import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, sign as edSign } from 'node:crypto'
import { verifyLicense } from './verify'

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
})
