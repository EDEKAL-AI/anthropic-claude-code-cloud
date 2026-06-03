// utilityProcess entry: one instance per WhatsApp account. Receives an init message and
// commands from the main process over process.parentPort, drives a BaileysSession, and
// posts WorkerEvent/WorkerResponse messages back. Bundled to out/main/worker.js and kept
// outside the asar archive so utilityProcess.fork() can resolve a real file path.

import { BaileysSession } from './baileys-session'
import type {
  WorkerInbound,
  WorkerCommand,
  WorkerEvent,
  WorkerResponse
} from '@shared/events'

const parentPort = process.parentPort

let session: BaileysSession | null = null

function post(message: WorkerEvent | WorkerResponse): void {
  parentPort.postMessage(message)
}

function emit(event: WorkerEvent): void {
  post(event)
}

async function handleCommand(command: WorkerCommand): Promise<unknown> {
  if (!session) throw new Error('worker not initialized')
  switch (command.type) {
    case 'connect':
      await session.connect()
      return null
    case 'disconnect':
      await session.disconnect()
      return null
    case 'logout':
      await session.logout()
      return null
    case 'requestPairingCode':
      return { code: await session.requestPairingCode(command.phone) }
    case 'sendMessage':
      return { waMessageId: await session.send(command.jid, command.content, command.simulateTyping ?? true) }
    case 'checkOnWhatsApp':
      return { exists: await session.checkOnWhatsApp(command.phone) }
    default:
      throw new Error(`unknown command: ${(command as { type: string }).type}`)
  }
}

parentPort.on('message', (e: { data: WorkerInbound }) => {
  const message = e.data
  if (message.kind === 'init') {
    const { init } = message
    session = new BaileysSession({
      accountId: init.accountId,
      phone: init.phone,
      pairingMethod: init.pairingMethod,
      authDbFile: init.authDbFile,
      masterKey: Buffer.from(init.masterKeyB64, 'base64'),
      emit
    })
    return
  }

  if (message.kind === 'command') {
    const { command } = message
    handleCommand(command)
      .then((result) => post({ id: command.id, ok: true, result }))
      .catch((err: Error) => post({ id: command.id, ok: false, error: err.message }))
  }
})

// Surface uncaught failures instead of dying silently (utilityProcess exit code is
// unreliable, so the supervisor relies on these logs + the exit event).
process.on('uncaughtException', (err) => {
  post({ type: 'log', accountId: 'unknown', level: 'error', message: `uncaught: ${err.message}` })
})
