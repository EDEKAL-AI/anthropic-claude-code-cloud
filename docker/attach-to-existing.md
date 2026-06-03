# Primary device runbook

Baileys can only ever be a **companion** device. Some **primary** device must hold the
registered WhatsApp number and come online at least once every 14 days (otherwise every
linked companion is logged out). This app supports two kinds of primary device.

## Option A — Physical phone (most reliable, lowest ban risk)

1. Register the number once in the normal WhatsApp app on a cheap Android/iPhone.
2. Keep the phone online (this trivially satisfies the 14-day rule).
3. In the app: add the account with **Primary device = Physical phone**, Connect, and
   either enter the **pairing code** on the phone (WhatsApp → Linked devices → Link with
   phone number) or scan the **QR**.

This is what the research recommends. No emulator infrastructure, no Play-Integrity
problems, far better survivability.

## Option B — Attach to an existing Android emulator (over ADB)

The app does **not** provision an emulator from scratch; it attaches to one you already
run (e.g. redroid, an Android Studio AVD, Genymotion). Day-to-day messaging always goes
through Baileys — ADB is only used to host the primary and to help enter the pairing code.

### Prerequisites

- Android **platform-tools** (`adb`) on your PATH.
- A running, ADB-reachable Android instance with the **real WhatsApp APK** installed and
  the number **already registered** (registration needs a real SMS/voice OTP — this step
  is manual and cannot be fully automated).

### Steps

```bash
# 1. Attach to the running instance (adjust host:port to your emulator)
adb connect 127.0.0.1:5555
adb devices                      # confirm state == "device"

# 2. Confirm WhatsApp is installed
adb -s 127.0.0.1:5555 shell pm list packages com.whatsapp
```

3. In the app: add the account with **Primary device = Emulator (ADB)**, Connect.
4. With **pairing code**: the 8-character code appears in the Accounts table. Enter it in
   the emulator's WhatsApp (Linked devices → Link with phone number). The `emulator/adb.ts`
   helper can type it via `adb shell input text` if you wire it to your instance.
5. Keep the emulator running (recommended 24/7) to satisfy the 14-day rule.

### Caveats (from research)

- Emulators **fail Play Integrity** and are the most ban-suspicious setup; the mautrix
  project (which runs WhatsApp in a VM in production) explicitly recommends a physical
  phone instead.
- `redroid` needs a **Linux host** with `binder_linux` / `ashmem` kernel modules, and ADB
  to multiple instances has known stability issues past the second container.
- Number registration always needs a real OTP — the emulator does not remove that
  constraint.

## After linking

Once a companion is linked, the app reconnects automatically on launch using the encrypted
auth store; you do not re-pair unless WhatsApp logs the device out (status 401/403/440).
