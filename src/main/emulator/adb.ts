// Emulator integration: control-plane ONLY. This attaches to an ALREADY-RUNNING Android
// instance (the user's existing emulator) over ADB to host the primary WhatsApp account —
// it does not provision redroid from scratch. Day-to-day messaging goes through Baileys,
// never through UI automation here. These helpers exist to assist registration/pairing
// (typing the pairing code, checking the device is alive) and to surface device status.
//
// The PrimaryDevice abstraction means a physical phone is equally valid: in that mode none
// of this is used; the user pairs by hand.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export interface AdbDevice {
  serial: string
  state: string // 'device' | 'offline' | 'unauthorized' | ...
}

async function adb(args: string[], timeoutMs = 15_000): Promise<string> {
  try {
    const { stdout } = await exec('adb', args, { timeout: timeoutMs })
    return stdout
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') {
      throw new Error('adb not found on PATH. Install Android platform-tools to use the emulator module.')
    }
    throw new Error(`adb ${args.join(' ')} failed: ${e.message}`)
  }
}

/** Attach to an emulator/device reachable over TCP, e.g. "127.0.0.1:5555". */
export async function connect(hostPort: string): Promise<void> {
  const out = await adb(['connect', hostPort])
  if (/cannot|failed|unable/i.test(out)) {
    throw new Error(`adb connect failed: ${out.trim()}`)
  }
}

export async function listDevices(): Promise<AdbDevice[]> {
  const out = await adb(['devices'])
  return out
    .split(/\r?\n/)
    .slice(1) // skip "List of devices attached"
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state] = line.split(/\s+/)
      return { serial, state: state ?? 'unknown' }
    })
}

/** True if the given serial is present and in the 'device' (ready) state. */
export async function isDeviceReady(serial: string): Promise<boolean> {
  const devices = await listDevices()
  return devices.some((d) => d.serial === serial && d.state === 'device')
}

/** Whether the WhatsApp package is installed on the device. */
export async function isWhatsAppInstalled(serial: string): Promise<boolean> {
  const out = await adb(['-s', serial, 'shell', 'pm', 'list', 'packages', 'com.whatsapp'])
  return out.includes('com.whatsapp')
}

/** Type text into the focused field — used to enter a pairing code in WhatsApp's UI. */
export async function inputText(serial: string, text: string): Promise<void> {
  // adb input text needs spaces escaped; keep it to safe characters (codes are digits).
  const safe = text.replace(/[^\w]/g, '')
  await adb(['-s', serial, 'shell', 'input', 'text', safe])
}

/** Open WhatsApp's linked-devices flow to make pairing easier (best-effort). */
export async function openLinkedDevices(serial: string): Promise<void> {
  await adb(['-s', serial, 'shell', 'monkey', '-p', 'com.whatsapp', '-c', 'android.intent.category.LAUNCHER', '1'])
}
