// Wraps one Baileys utilityProcess for a single account: forks it, performs the init
// handshake, exposes a typed request/response command API (correlated by id), and forwards
// unsolicited WorkerEvents. The supervisor owns the bridge's lifecycle and restarts.

import { utilityProcess, type UtilityProcess } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  isWorkerResponse,
  isWorkerEvent,
  type OutgoingContent,
  type WorkerCommand,
  type WorkerEvent,
  type WorkerInit
} from '@shared/events'

const WORKER_PATH = join(dirname(fileURLToPath(import.meta.url)), 'worker.js')

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

export interface BridgeCallbacks {
  onEvent: (event: WorkerEvent) => void
  onExit: (code: number) => void
}

export class WorkerBridge {
  private child: UtilityProcess | null = null
  private pending = new Map<string, Pending>()
  private intendedStop = false

  constructor(
    private init: WorkerInit,
    private callbacks: BridgeCallbacks
  ) {}

  get accountId(): string {
    return this.init.accountId
  }

  /** True when the worker exited because we asked it to (vs. a crash). */
  get stoppedIntentionally(): boolean {
    return this.intendedStop
  }

  start(): void {
    this.intendedStop = false
    const child = utilityProcess.fork(WORKER_PATH, [this.init.accountId], {
      serviceName: `baileys-${this.init.accountId}`,
      stdio: 'pipe'
    })
    this.child = child

    child.on('message', (message: unknown) => {
      if (isWorkerResponse(message)) {
        const p = this.pending.get(message.id)
        if (p) {
          this.pending.delete(message.id)
          if (message.ok) p.resolve(message.result)
          else p.reject(new Error(message.error ?? 'worker error'))
        }
        return
      }
      if (isWorkerEvent(message)) {
        this.callbacks.onEvent(message)
      }
    })

    child.on('exit', (code: number) => {
      // Reject any in-flight commands so callers don't hang.
      for (const [, p] of this.pending) p.reject(new Error('worker exited'))
      this.pending.clear()
      this.child = null
      this.callbacks.onExit(code)
    })

    child.postMessage({ kind: 'init', init: this.init })
  }

  private command<T = unknown>(command: WorkerCommand): Promise<T> {
    if (!this.child) return Promise.reject(new Error('worker not running'))
    return new Promise<T>((resolve, reject) => {
      this.pending.set(command.id, { resolve: resolve as (v: unknown) => void, reject })
      this.child!.postMessage({ kind: 'command', command })
      // Safety timeout so a wedged socket can't leak a pending promise forever.
      setTimeout(() => {
        if (this.pending.has(command.id)) {
          this.pending.delete(command.id)
          reject(new Error('command timed out'))
        }
      }, 60_000)
    })
  }

  connect(): Promise<void> {
    return this.command({ id: randomUUID(), type: 'connect' })
  }

  requestPairingCode(phone: string): Promise<{ code: string }> {
    return this.command({ id: randomUUID(), type: 'requestPairingCode', phone })
  }

  sendMessage(jid: string, content: OutgoingContent, simulateTyping = true): Promise<{ waMessageId: string | null }> {
    return this.command({ id: randomUUID(), type: 'sendMessage', jid, content, simulateTyping })
  }

  checkOnWhatsApp(phone: string): Promise<{ exists: boolean }> {
    return this.command({ id: randomUUID(), type: 'checkOnWhatsApp', phone })
  }

  async stop(): Promise<void> {
    this.intendedStop = true
    try {
      await this.command({ id: randomUUID(), type: 'disconnect' })
    } catch {
      /* ignore */
    }
    this.child?.kill()
    this.child = null
  }

  async logout(): Promise<void> {
    this.intendedStop = true
    try {
      await this.command({ id: randomUUID(), type: 'logout' })
    } catch {
      /* ignore */
    }
    this.child?.kill()
    this.child = null
  }
}
