// Owns one WorkerBridge per account: spawns, restarts (with a circuit breaker), and routes
// every WorkerEvent to the DB, the renderer, and the auto-reply engine.
//
// utilityProcess crash exit codes are unreliable (always 0), so "was this intended?" is
// tracked on the bridge, not inferred from the code.

import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { Repositories } from '../db/repositories'
import { normalizePhone } from '../db/repositories/contacts'
import { isOptOutMessage } from '@shared/logic/optout'
import type { OutgoingContent, WorkerEvent } from '@shared/events'
import type { Account } from '@shared/models'
import { WorkerBridge } from './worker-bridge'

const RESTART_WINDOW_MS = 60_000
const MAX_RESTARTS_PER_WINDOW = 5

type RestartInfo = { count: number; windowStart: number }

export interface IncomingMessage {
  accountId: string
  fromJid: string
  fromPhone: string | null
  text: string | null
  contactId: number | null
}

export class Supervisor {
  private bridges = new Map<string, WorkerBridge>()
  private restarts = new Map<string, RestartInfo>()
  private pushEvent: (event: WorkerEvent) => void = () => {}
  private onIncoming: (msg: IncomingMessage) => void = () => {}

  constructor(
    private repos: Repositories,
    private masterKey: Buffer
  ) {
    const dir = join(app.getPath('userData'), 'sessions')
    mkdirSync(dir, { recursive: true })
  }

  /** Wire the renderer push channel (webContents.send). */
  setPushHandler(fn: (event: WorkerEvent) => void): void {
    this.pushEvent = fn
  }

  /** Wire the auto-reply engine's incoming-message handler. */
  setIncomingHandler(fn: (msg: IncomingMessage) => void): void {
    this.onIncoming = fn
  }

  private authDbFile(accountId: string): string {
    return join(app.getPath('userData'), 'sessions', `${accountId}-auth.db`)
  }

  private ensureBridge(account: Account): WorkerBridge {
    let bridge = this.bridges.get(account.id)
    if (bridge) return bridge
    bridge = new WorkerBridge(
      {
        accountId: account.id,
        phone: normalizePhone(account.phone),
        pairingMethod: account.pairingMethod,
        authDbFile: this.authDbFile(account.id),
        masterKeyB64: this.masterKey.toString('base64')
      },
      {
        onEvent: (event) => this.handleEvent(event),
        onExit: (code) => this.handleExit(account.id, code)
      }
    )
    this.bridges.set(account.id, bridge)
    bridge.start()
    return bridge
  }

  /** Spawn workers for all accounts that have credentials (status !== 'unlinked'). */
  startAll(): void {
    for (const account of this.repos.accounts.list()) {
      if (account.status !== 'unlinked' && account.status !== 'banned') {
        this.connect(account.id)
      }
    }
  }

  async connect(accountId: string): Promise<void> {
    const account = this.repos.accounts.get(accountId)
    if (!account) throw new Error('account not found')
    const bridge = this.ensureBridge(account)
    await bridge.connect()
  }

  async disconnect(accountId: string): Promise<void> {
    const bridge = this.bridges.get(accountId)
    if (!bridge) return
    await bridge.stop()
    this.bridges.delete(accountId)
    this.repos.accounts.setStatus(accountId, 'unlinked')
  }

  async logout(accountId: string): Promise<void> {
    const bridge = this.bridges.get(accountId)
    if (bridge) {
      await bridge.logout()
      this.bridges.delete(accountId)
    }
    this.repos.accounts.setStatus(accountId, 'unlinked')
  }

  async requestPairingCode(accountId: string): Promise<string> {
    const account = this.repos.accounts.get(accountId)
    if (!account) throw new Error('account not found')
    const bridge = this.ensureBridge(account)
    const { code } = await bridge.requestPairingCode(normalizePhone(account.phone))
    return code
  }

  /** Send a message through an account's worker. Used by scheduler and auto-reply. */
  async sendMessage(accountId: string, jid: string, content: OutgoingContent, simulateTyping = true): Promise<string | null> {
    const bridge = this.bridges.get(accountId)
    if (!bridge) throw new Error('account not connected')
    const { waMessageId } = await bridge.sendMessage(jid, content, simulateTyping)
    return waMessageId
  }

  isConnected(accountId: string): boolean {
    return this.bridges.has(accountId)
  }

  private handleEvent(event: WorkerEvent): void {
    switch (event.type) {
      case 'status':
        this.repos.accounts.setStatus(event.accountId, event.status)
        break
      case 'message':
        this.handleIncomingMessage(event)
        break
      case 'messageStatus':
        this.repos.messages.updateStatusByWaId(event.accountId, event.waMessageId, event.status)
        break
      // qr / pairingCode / credsUpdated / log are forwarded to the renderer only
    }
    // Always forward to the renderer so the UI reflects live state.
    this.pushEvent(event)
  }

  private handleIncomingMessage(event: Extract<WorkerEvent, { type: 'message' }>): void {
    const phone = event.fromPhone ? normalizePhone(event.fromPhone) : null
    let contactId: number | null = null
    if (phone) {
      const contact = this.repos.contacts.upsert({ accountId: event.accountId, phone })
      contactId = contact.id
    }

    this.repos.messages.log({
      accountId: event.accountId,
      direction: 'in',
      contactId,
      waMessageId: event.waMessageId || null,
      body: event.text,
      status: 'received'
    })

    // Honour opt-out immediately and do not auto-reply to it.
    if (event.text && isOptOutMessage(event.text) && phone) {
      this.repos.contacts.setOptOutByPhone(event.accountId, phone)
      return
    }

    this.onIncoming({
      accountId: event.accountId,
      fromJid: event.fromJid,
      fromPhone: phone,
      text: event.text,
      contactId
    })
  }

  private handleExit(accountId: string, code: number): void {
    const bridge = this.bridges.get(accountId)
    const intended = bridge?.stoppedIntentionally ?? true
    this.bridges.delete(accountId)
    if (intended) return

    // Circuit breaker: cap restarts within a rolling window so a permanently failing
    // (e.g. banned) account cannot hot-loop.
    const now = Date.now()
    const info = this.restarts.get(accountId) ?? { count: 0, windowStart: now }
    if (now - info.windowStart > RESTART_WINDOW_MS) {
      info.count = 0
      info.windowStart = now
    }
    info.count++
    this.restarts.set(accountId, info)

    if (info.count > MAX_RESTARTS_PER_WINDOW) {
      this.pushEvent({
        type: 'log',
        accountId,
        level: 'error',
        message: `worker exited (code ${code}); restart circuit breaker tripped, giving up`
      })
      this.repos.accounts.setStatus(accountId, 'unlinked')
      return
    }

    const backoff = Math.min(30_000, 1000 * 2 ** info.count)
    setTimeout(() => {
      const account = this.repos.accounts.get(accountId)
      if (account && account.status !== 'banned') void this.connect(accountId)
    }, backoff)
  }

  async stopAll(): Promise<void> {
    for (const bridge of this.bridges.values()) {
      await bridge.stop()
    }
    this.bridges.clear()
  }
}
