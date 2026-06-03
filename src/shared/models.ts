// Core domain models. Single source of truth shared by main, preload, renderer and worker.

export type AccountStatus =
  | 'unlinked' // no valid credentials; needs pairing
  | 'connecting' // socket opening / pairing in progress
  | 'linked' // connected and ready
  | 'banned' // WhatsApp returned forbidden (403) — terminal

export type PrimaryKind = 'emulator' | 'phone'

export type PairingMethod = 'code' | 'qr'

export interface Account {
  id: string
  phone: string // E.164, digits only (no '+')
  label: string
  status: AccountStatus
  pairingMethod: PairingMethod
  primaryKind: PrimaryKind
  /** Warmup ladder stage. Gates the daily cap; new numbers start at 0. */
  warmupStage: number
  dailySentCount: number
  /** ISO timestamp marking the start of the rolling 24h send window. */
  dailyWindowStart: string | null
  lastConnectedAt: string | null
  createdAt: string
}

export type ListType = 'list' | 'group' | 'tag'

export interface Contact {
  id: number
  accountId: string | null // null = global contact, otherwise scoped to an account
  waJid: string | null
  phone: string
  name: string | null
  optIn: boolean
  optOut: boolean
  notes: string | null
  createdAt: string
}

export interface ContactList {
  id: number
  name: string
  type: ListType
}

export interface Template {
  id: number
  name: string
  /** Body supports {{var}} placeholders, e.g. "Hi {{name}}". */
  body: string
  mediaPath: string | null
  mediaType: string | null
  createdAt: string
}

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'done'
  | 'failed'

export interface Campaign {
  id: number
  accountId: string
  name: string
  templateId: number
  listId: number
  status: CampaignStatus
  scheduledAt: string | null
  /** null = one-shot; otherwise a cron expression for recurring campaigns. */
  recurrence: string | null
  rateMinMs: number
  rateMaxMs: number
  dailyCap: number
  createdAt: string
}

export type JobStatus =
  | 'pending'
  | 'running'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'skipped'

export interface CampaignJob {
  id: number
  campaignId: number
  contactId: number
  status: JobStatus
  scheduledFor: string
  attempts: number
  lockedAt: string | null
  sentAt: string | null
  error: string | null
  waMessageId: string | null
}

export type MessageDirection = 'in' | 'out'

export interface MessageLog {
  id: number
  accountId: string
  direction: MessageDirection
  contactId: number | null
  waMessageId: string | null
  body: string | null
  mediaPath: string | null
  status: string | null
  ts: string
}

export type MatchType = 'exact' | 'contains' | 'regex' | 'fallback'

export interface AutoReplyRule {
  id: number
  accountId: string
  matchType: MatchType
  keyword: string | null
  templateId: number
  enabled: boolean
  priority: number
}

export interface LicenseInfo {
  /** Customer name / identifier. */
  sub: string
  /** Expiry epoch ms; 0 means perpetual. */
  exp: number
  /** Allowed WhatsApp accounts (0 = unlimited). */
  seats: number
  /** Issued-at epoch ms. */
  iat: number
}
