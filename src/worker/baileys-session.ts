// One Baileys socket = one WhatsApp account. Owns connect/reconnect/pairing/send/receive
// and translates Baileys events into the app's WorkerEvent protocol. Runs inside a
// utilityProcess (one per account) so a crash or ban here cannot affect other accounts.

import makeWASocket, {
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers,
  getContentType,
  jidNormalizedUser,
  type WASocket,
  type WAMessage,
  type WAMessageKey,
  type WAVersion
} from '@whiskeysockets/baileys'
import pino from 'pino'
import { SimpleCache } from './cache'
import { useSqliteAuthState } from './auth-store'
import { sendMessage } from './sender'
import type { OutgoingContent, WorkerEvent } from '@shared/events'
import type { AccountStatus } from '@shared/models'

const logger = pino({ level: 'warn' })

export interface SessionOptions {
  accountId: string
  phone: string // E.164 digits only
  pairingMethod: 'code' | 'qr'
  authDbFile: string
  masterKey: Buffer
  emit: (event: WorkerEvent) => void
}

const MAX_BACKOFF_MS = 60_000

export class BaileysSession {
  private sock: WASocket | null = null
  private saveCreds: () => void = () => {}
  private closeAuthDb: (() => void) | null = null
  private reconnectAttempts = 0
  private cachedVersion: WAVersion | null = null
  private stopping = false
  // small buffer of recently sent/seen messages so getMessage can satisfy retries
  private recentMessages = new SimpleCache<WAMessage['message']>(10 * 60_000)
  private msgRetryCounterCache = new SimpleCache()

  constructor(private opts: SessionOptions) {}

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    this.opts.emit({ type: 'log', accountId: this.opts.accountId, level, message })
  }

  private setStatus(status: AccountStatus, reason?: string): void {
    this.opts.emit({ type: 'status', accountId: this.opts.accountId, status, reason })
  }

  async connect(): Promise<void> {
    this.stopping = false
    if (!this.cachedVersion) {
      const { version } = await fetchLatestBaileysVersion()
      this.cachedVersion = version
    }

    // Close any auth DB from a previous connection before reopening (reconnects reuse this).
    this.closeAuthDb?.()
    const { state, saveCreds, close } = useSqliteAuthState(this.opts.authDbFile, this.opts.masterKey)
    this.saveCreds = saveCreds
    this.closeAuthDb = close

    this.setStatus('connecting')

    const sock = makeWASocket({
      version: this.cachedVersion,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      // Stable per-account fingerprint (do not randomize across reconnects).
      browser: Browsers.macOS('Desktop'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      msgRetryCounterCache: this.msgRetryCounterCache,
      generateHighQualityLinkPreview: true,
      getMessage: async (key: WAMessageKey) => {
        const cached = key.id ? this.recentMessages.get(key.id) : undefined
        return cached ?? undefined
      }
    })
    this.sock = sock

    sock.ev.on('creds.update', () => {
      this.saveCreds()
      this.opts.emit({ type: 'credsUpdated', accountId: this.opts.accountId })
    })

    sock.ev.on('connection.update', (update) => {
      void this.handleConnectionUpdate(update)
    })

    sock.ev.on('messages.upsert', (upsert) => {
      this.handleIncoming(upsert)
    })

    sock.ev.on('messages.update', (updates) => {
      for (const u of updates) {
        const id = u.key.id
        const statusNum = u.update.status
        if (!id || statusNum == null) continue
        // Baileys status: 3 = DELIVERY_ACK, 4 = READ
        if (statusNum >= 4) {
          this.opts.emit({ type: 'messageStatus', accountId: this.opts.accountId, waMessageId: id, status: 'read' })
        } else if (statusNum === 3) {
          this.opts.emit({
            type: 'messageStatus',
            accountId: this.opts.accountId,
            waMessageId: id,
            status: 'delivered'
          })
        }
      }
    })
  }

  private async handleConnectionUpdate(update: {
    connection?: string
    lastDisconnect?: { error?: Error }
    qr?: string
  }): Promise<void> {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      // QR is offered when no creds yet. For the code flow, request a pairing code instead.
      if (this.opts.pairingMethod === 'code' && this.sock && !this.sock.authState.creds.registered) {
        try {
          const code = await this.sock.requestPairingCode(this.opts.phone)
          this.opts.emit({ type: 'pairingCode', accountId: this.opts.accountId, code })
        } catch (err) {
          this.log('error', `requestPairingCode failed: ${(err as Error).message}`)
          this.opts.emit({ type: 'qr', accountId: this.opts.accountId, qr })
        }
      } else {
        this.opts.emit({ type: 'qr', accountId: this.opts.accountId, qr })
      }
    }

    if (connection === 'open') {
      this.reconnectAttempts = 0
      this.setStatus('linked')
      this.log('info', 'connection open')
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
        ?.statusCode

      if (this.stopping) {
        this.setStatus('unlinked', 'stopped')
        return
      }

      if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.forbidden) {
        // Terminal: account logged out or banned. Require re-pairing.
        const reason = statusCode === DisconnectReason.forbidden ? 'banned' : 'logged-out'
        this.setStatus(statusCode === DisconnectReason.forbidden ? 'banned' : 'unlinked', reason)
        this.log('error', `terminal disconnect: ${reason}`)
        return
      }

      if (statusCode === DisconnectReason.restartRequired) {
        // Expected right after pairing — recreate the socket immediately (no backoff).
        this.log('info', 'restart required, recreating socket')
        await this.connect()
        return
      }

      if (statusCode === DisconnectReason.connectionReplaced) {
        // Another live socket took over this session; do not fight it.
        this.setStatus('unlinked', 'connection-replaced')
        this.log('warn', 'connection replaced by another session')
        return
      }

      // Transient: reconnect with exponential backoff + jitter.
      this.reconnectAttempts++
      const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.reconnectAttempts)
      const jitter = Math.floor(Math.random() * 1000)
      this.log('warn', `disconnected (${statusCode ?? 'unknown'}), retrying in ${backoff}ms`)
      setTimeout(() => {
        if (!this.stopping) void this.connect()
      }, backoff + jitter)
    }
  }

  private handleIncoming(upsert: { messages: WAMessage[]; type: string }): void {
    if (upsert.type !== 'notify') return
    for (const msg of upsert.messages) {
      if (!msg.message || msg.key.fromMe) continue
      const id = msg.key.id
      if (id) this.recentMessages.set(id, msg.message)

      const contentType = getContentType(msg.message)
      const hasMedia =
        contentType === 'imageMessage' ||
        contentType === 'videoMessage' ||
        contentType === 'documentMessage' ||
        contentType === 'audioMessage'

      const text =
        msg.message.conversation ??
        msg.message.extendedTextMessage?.text ??
        msg.message.imageMessage?.caption ??
        msg.message.videoMessage?.caption ??
        null

      const fromJid = msg.key.remoteJid ? jidNormalizedUser(msg.key.remoteJid) : ''
      const fromPhone = fromJid.includes('@') ? fromJid.split('@')[0] : null

      this.opts.emit({
        type: 'message',
        accountId: this.opts.accountId,
        waMessageId: id ?? '',
        fromJid,
        fromPhone,
        text,
        hasMedia,
        timestamp: typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : Date.now() / 1000
      })
    }
  }

  async requestPairingCode(phone: string): Promise<string> {
    if (!this.sock) throw new Error('socket not connected')
    return this.sock.requestPairingCode(phone)
  }

  async send(jid: string, content: OutgoingContent, simulateTyping: boolean): Promise<string | null> {
    if (!this.sock) throw new Error('socket not connected')
    const id = await sendMessage(this.sock, jid, content, simulateTyping)
    return id
  }

  async checkOnWhatsApp(phone: string): Promise<boolean> {
    if (!this.sock) throw new Error('socket not connected')
    const results = await this.sock.onWhatsApp(phone)
    return !!results?.[0]?.exists
  }

  async disconnect(): Promise<void> {
    this.stopping = true
    try {
      this.sock?.end(undefined)
    } catch {
      /* ignore */
    }
    this.sock = null
    this.closeAuthDb?.()
    this.closeAuthDb = null
  }

  async logout(): Promise<void> {
    this.stopping = true
    try {
      await this.sock?.logout()
    } catch {
      /* ignore */
    }
    this.sock = null
    this.setStatus('unlinked', 'logout')
  }
}
