// Vendor tool: sign a license key for a customer.
//   node tools/license-sign.mjs "Customer Name" <days> <seats>
// <days> = 0 for perpetual, <seats> = 0 for unlimited.
// Reads the private key from tools/private.pem (or $LICENSE_PRIVATE_KEY_PEM).

import { sign as edSign, createPrivateKey } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const sub = process.argv[2]
const daysArg = process.argv[3]
const seatsArg = process.argv[4]

if (!sub || daysArg == null || seatsArg == null) {
  console.error('usage: node tools/license-sign.mjs "Customer Name" <days> <seats>')
  console.error('  <days> = 0 for perpetual, <seats> = 0 for unlimited')
  process.exit(1)
}

const days = Number(daysArg)
const seats = Number(seatsArg)

// Reject mistyped/non-numeric args rather than silently minting a perpetual/unlimited key.
if (!Number.isInteger(days) || days < 0) {
  console.error('<days> must be a non-negative integer')
  process.exit(1)
}
if (!Number.isInteger(seats) || seats < 0) {
  console.error('<seats> must be a non-negative integer')
  process.exit(1)
}

const pem = process.env.LICENSE_PRIVATE_KEY_PEM ?? readFileSync(join(here, 'private.pem'), 'utf8')
const key = createPrivateKey(pem)

const now = Date.now()
const payload = {
  sub,
  exp: days > 0 ? now + days * 86_400_000 : 0,
  seats,
  iat: now
}

const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8')
const sig = edSign(null, payloadBytes, key)

const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const token = `${b64url(payloadBytes)}.${b64url(sig)}`

console.log(token)
