// Worker <-> main RPC protocol carried over MessagePort (MessageChannelMain).
//
// Two logical lanes share this protocol:
//   * control lane (main -> worker): commands + correlated responses
//   * event lane (worker -> main/renderer): unsolicited push events

import type { AccountStatus } from './models'

// ---- Commands: main -> worker (request/response, correlated by `id`) ----

export interface WorkerInit {
  accountId: string
  phone: string
  pairingMethod: 'code' | 'qr'
  /** Absolute path to this account's encrypted auth SQLite file. */
  authDbFile: string
  /** AES master key (base64) used to encrypt the auth store; supplied by main. */
  masterKeyB64: string
}

/** First message main -> worker, carrying everything the session needs to boot. */
export interface WorkerInitMessage {
  kind: 'init'
  init: WorkerInit
}

/** Subsequent main -> worker messages are commands. */
export interface WorkerCommandMessage {
  kind: 'command'
  command: WorkerCommand
}

export type WorkerInbound = WorkerInitMessage | WorkerCommandMessage

export type WorkerCommand =
  | { id: string; type: 'connect' }
  | { id: string; type: 'disconnect' }
  | { id: string; type: 'logout' }
  | { id: string; type: 'requestPairingCode'; phone: string }
  | {
      id: string
      type: 'sendMessage'
      jid: string
      content: OutgoingContent
      simulateTyping?: boolean
    }
  | { id: string; type: 'checkOnWhatsApp'; phone: string }

export interface OutgoingContent {
  text?: string
  /** Absolute path to a media file on disk. */
  mediaPath?: string
  mediaType?: 'image' | 'video' | 'document' | 'audio'
  caption?: string
  fileName?: string
}

export interface WorkerResponse {
  id: string
  ok: boolean
  /** Present when ok === true. */
  result?: unknown
  /** Present when ok === false. */
  error?: string
}

// ---- Events: worker -> main (then fanned out to renderer) ----

export type WorkerEvent =
  | { type: 'qr'; accountId: string; qr: string }
  | { type: 'pairingCode'; accountId: string; code: string }
  | { type: 'status'; accountId: string; status: AccountStatus; reason?: string }
  | {
      type: 'message'
      accountId: string
      waMessageId: string
      fromJid: string
      fromPhone: string | null
      text: string | null
      hasMedia: boolean
      timestamp: number
    }
  | {
      type: 'messageStatus'
      accountId: string
      waMessageId: string
      status: 'delivered' | 'read'
    }
  | { type: 'credsUpdated'; accountId: string }
  | { type: 'log'; accountId: string; level: 'info' | 'warn' | 'error'; message: string }

export function isWorkerResponse(msg: unknown): msg is WorkerResponse {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'id' in msg &&
    'ok' in msg
  )
}

export function isWorkerEvent(msg: unknown): msg is WorkerEvent {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    !('ok' in msg)
  )
}
