// Embedded Ed25519 public key used to verify offline license tokens. The vendor holds the
// matching private key (never shipped) and signs license keys for paying customers.
// To rotate: run `node tools/license-keygen.mjs`, paste the new public key here, and keep
// the new private key secret.

export const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA3pTDlTTzyHu4M9bAM7aYqlInTIyfBaNaogV30jFqNPo=
-----END PUBLIC KEY-----`
