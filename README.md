# WhatsApp Marketing (Electron + Baileys)

A desktop application for managing **multiple WhatsApp accounts** for marketing
automation — contact management, message templates, basic auto-reply, scheduled
campaigns and bulk sending — built on **Electron + React + TypeScript** with
**Baileys** (companion device) for the WhatsApp connection.

> ⚠️ **Read this first.** Baileys is an *unofficial* WhatsApp API. Bulk / automated
> messaging **violates WhatsApp's Terms of Service** and numbers **do get banned** —
> even aged ones. This app builds in safeguards (opt-in/opt-out, randomized pacing,
> warmup ladder, daily caps, quiet hours) that *reduce* but do not *eliminate* that
> risk. Treat every number as disposable. For a real business that needs deliverability
> and scale, use the official **WhatsApp Business Cloud API** instead. The sender
> boundary is designed so Baileys can later be swapped for the Cloud API.

## Architecture

```
Electron main (Node)                         Renderer (React + TS)
 ├─ SQLite (better-sqlite3, WAL, single writer)   contacts / templates /
 ├─ Scheduler (node-cron → durable job queue)     campaigns / accounts / inbox
 ├─ Auto-reply engine                                  ▲ contextBridge (typed)
 ├─ Account Supervisor ── utilityProcess (1 / account) │
 │                          └ Baileys socket + encrypted auth store
 │                                   │ WhatsApp Web protocol (companion)
 └─ Emulator/ADB module ── attaches to an existing Android instance (primary device)
```

- **Baileys is always a companion** — it never holds the registration. A *primary
  device* (an Android emulator the app attaches to over ADB, **or** a physical phone)
  holds the registered number. The primary must reconnect at least once every 14 days
  or all companions are logged out.
- **One `utilityProcess` per account** isolates crashes/bans; the supervisor restarts
  workers with a circuit breaker (utilityProcess crash exit codes are unreliable, so
  intended-stop is tracked explicitly).
- **Auth state** is stored per account in an encrypted SQLite file
  (`sessions/<id>-auth.db`), AES-256-GCM with a master key protected by the OS keychain
  (Electron `safeStorage`). It is **not** `useMultiFileAuthState` (which the Baileys docs
  warn against in production).

## Project layout

```
src/
  shared/          types + IPC contract + worker protocol + pure logic (unit-tested)
  main/            db (migrations + repositories), accounts (supervisor + worker bridge),
                   scheduler, autoreply, emulator (adb), security (safeStorage), ipc
  preload/         contextBridge bridge (allowlisted channels only)
  renderer/        React app (Accounts, Contacts, Templates, Campaigns, Inbox)
  worker/          Baileys session (one per account, runs in utilityProcess)
docker/            emulator attach runbook
```

## Develop

```bash
pnpm install          # installs deps; native modules build for the Node ABI
pnpm test             # unit + DB integration tests (vitest)
pnpm typecheck        # node + web
pnpm dev              # run the app with HMR
```

### Native module ABI (important)

`better-sqlite3` is a native module. `pnpm install` builds it for **Node** (so `pnpm test`
works). Before running the **Electron** app you must rebuild it for Electron's ABI:

```bash
pnpm rebuild:electron   # rebuild better-sqlite3 against Electron headers
pnpm dev                # or pnpm start / pnpm package
```

If you then want to run `pnpm test` again, reinstall to restore the Node-ABI build
(`pnpm install`).

## Build & package

```bash
pnpm build              # bundle main / preload / renderer / worker
pnpm package            # build + electron-builder installers (NSIS / dmg / AppImage / deb)
```

The Baileys worker is emitted to `out/main/worker.js` and kept **outside** the asar
archive (`asarUnpack`) so `utilityProcess.fork()` can resolve a real path. Verify
`utilityProcess` works in a *packaged* build, not just `pnpm dev`.

- **App icon**: `resources/icon.png` (1024×1024). Regenerate with `node tools/make-icon.mjs`;
  electron-builder derives `.ico`/`.icns` from it.
- **Auto-update**: `electron-updater` checks on launch in packaged builds. Set the feed in
  `electron-builder.yml` under `publish` (generic URL or `provider: github`). The app writes
  `app-update.yml` into the package automatically.
- **Code signing**: set Apple Developer ID + notarization (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_TEAM_ID`) and Windows Authenticode credentials in your CI environment.

## Licensing

The app is gated by an offline license key (Ed25519-signed, verified against an embedded
public key — no network needed). On first launch an activation screen accepts the key; seat
limits cap how many WhatsApp accounts can be added.

Vendor workflow (keep the private key secret, never commit it):

```bash
node tools/license-keygen.mjs                       # once: make a key pair; paste public key
node tools/license-sign.mjs "Customer Name" 365 5   # sign a 365-day, 5-seat license
```

## Dependencies & security

`@whiskeysockets/baileys` is pinned to **6.7.23** (the maintained `legacy` 6.x line). The
higher-numbered `6.17.x` is affected by advisory GHSA-qvv5-jq5g-4cgg (message spoofing) — do
**not** bump to it. Moving to `7.0.0-rc` (LID protocol) is the forward path when ready; the
worker/auth boundary is designed to absorb that migration.

## Primary device

See [`docker/attach-to-existing.md`](docker/attach-to-existing.md) for attaching to an
existing Android emulator over ADB and pairing Baileys as a companion, plus the physical
phone alternative.

## Milestone status

- [x] M0 Scaffold (electron-vite, secure window, typed IPC)
- [x] M1 Baileys single-account session (pairing code + QR, send/receive)
- [x] M2 Persistence + encrypted auth store + session restore
- [x] M3 Contacts (CSV import) + lists + templates
- [x] M4 Scheduling + bulk send + anti-ban gate + durable queue
- [x] M5 Auto-reply engine (keyword rules + cooldown + opt-out)
- [x] M6 Multi-account supervisor + circuit-breaker restarts
- [x] M7 Emulator/ADB primary-device module (attach to existing) + physical-phone option
- [x] M8 Packaging: app icon, asarUnpack worker + native module, auto-update feed,
      validated via `electron-builder --linux dir`. Code signing / notarization need real
      Apple/Windows credentials (CI env), and the auto-update `url` must point at your host.

Live WhatsApp pairing/sending is verified manually (see the runbook); automated tests
cover the pure logic and the SQLite data layer.
