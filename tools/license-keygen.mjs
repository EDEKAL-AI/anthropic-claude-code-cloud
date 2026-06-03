// Vendor tool: generate a fresh Ed25519 license signing key pair.
//   node tools/license-keygen.mjs
// Writes tools/private.pem (KEEP SECRET, gitignored) and prints the public key to paste
// into src/main/license/public-key.ts.

import { generateKeyPairSync } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const privateKeyPath = join(here, 'private.pem')

// Never silently clobber an existing signing key — losing it means you can't issue renewals
// for already-shipped builds. Require an explicit --force/--rotate to overwrite.
if (existsSync(privateKeyPath) && !process.argv.includes('--force') && !process.argv.includes('--rotate')) {
  console.error(`Refusing to overwrite existing key: ${privateKeyPath} (pass --rotate to replace)`)
  process.exit(1)
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519')

const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

writeFileSync(privateKeyPath, priv, { mode: 0o600 })

console.log('Wrote tools/private.pem (keep secret!).\n')
console.log('Paste this into src/main/license/public-key.ts:\n')
console.log('export const LICENSE_PUBLIC_KEY = `' + pub.trim() + '`')
