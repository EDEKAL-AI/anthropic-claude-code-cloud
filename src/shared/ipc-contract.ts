// Single source of truth for renderer <-> main IPC. Both the preload bridge and the
// renderer's typed API client import these definitions, so renaming a channel or
// changing a payload type surfaces as a compile error on every call site.

import type {
  Account,
  AutoReplyRule,
  Campaign,
  Contact,
  ContactList,
  LicenseInfo,
  MessageLog,
  Template
} from './models'
import type { OutgoingContent, WorkerEvent } from './events'

// ---- Request/response channels (renderer -> main via invoke/handle) ----

export interface IpcRequests {
  // License / activation
  'license:status': { req: void; res: { activated: boolean; payload?: LicenseInfo } }
  'license:activate': { req: { token: string }; res: { ok: boolean; error?: string } }

  // Global settings
  'settings:get': { req: void; res: Record<string, string> }
  'settings:set': { req: { key: string; value: string }; res: void }

  // Accounts
  'accounts:list': { req: void; res: Account[] }
  'accounts:create': {
    req: { phone: string; label: string; primaryKind: Account['primaryKind']; pairingMethod: Account['pairingMethod'] }
    res: Account
  }
  'accounts:connect': { req: { accountId: string }; res: void }
  'accounts:disconnect': { req: { accountId: string }; res: void }
  'accounts:logout': { req: { accountId: string }; res: void }
  'accounts:requestPairingCode': { req: { accountId: string }; res: { code: string } }
  'accounts:delete': { req: { accountId: string }; res: void }

  // Contacts & lists
  'contacts:list': { req: { accountId?: string }; res: Contact[] }
  'contacts:importCsv': { req: { csv: string; accountId: string | null }; res: { imported: number } }
  'contacts:setOptOut': { req: { contactId: number; optOut: boolean }; res: void }
  'lists:list': { req: void; res: ContactList[] }
  'lists:create': { req: { name: string; type: ContactList['type'] }; res: ContactList }
  'lists:addMembers': { req: { listId: number; contactIds: number[] }; res: void }

  // Templates
  'templates:list': { req: void; res: Template[] }
  'templates:create': { req: { name: string; body: string; mediaPath?: string; mediaType?: string }; res: Template }
  'templates:delete': { req: { templateId: number }; res: void }
  'templates:preview': { req: { templateId: number; contactId: number }; res: { body: string } }

  // Campaigns
  'campaigns:list': { req: void; res: Campaign[] }
  'campaigns:create': {
    req: {
      accountId: string
      name: string
      templateId: number
      listId: number
      scheduledAt: string | null
      recurrence: string | null
      rateMinMs: number
      rateMaxMs: number
      dailyCap: number
    }
    res: Campaign
  }
  'campaigns:pause': { req: { campaignId: number }; res: void }
  'campaigns:resume': { req: { campaignId: number }; res: void }
  'campaigns:progress': {
    req: { campaignId: number }
    res: { total: number; sent: number; failed: number; pending: number }
  }

  // Auto-reply
  'autoreply:list': { req: { accountId: string }; res: AutoReplyRule[] }
  'autoreply:create': {
    req: Omit<AutoReplyRule, 'id'>
    res: AutoReplyRule
  }
  'autoreply:delete': { req: { ruleId: number }; res: void }

  // Messages / inbox
  'messages:list': { req: { accountId: string; limit?: number }; res: MessageLog[] }
  'messages:send': { req: { accountId: string; jid: string; content: OutgoingContent }; res: void }
}

export type IpcChannel = keyof IpcRequests
export type IpcReq<C extends IpcChannel> = IpcRequests[C]['req']
export type IpcRes<C extends IpcChannel> = IpcRequests[C]['res']

// ---- Push channels (main -> renderer via webContents.send) ----

export interface IpcPushEvents {
  'worker:event': WorkerEvent
}

export type IpcPushChannel = keyof IpcPushEvents

export const IPC_CHANNELS: IpcChannel[] = [
  'license:status',
  'license:activate',
  'settings:get',
  'settings:set',
  'accounts:list',
  'accounts:create',
  'accounts:connect',
  'accounts:disconnect',
  'accounts:logout',
  'accounts:requestPairingCode',
  'accounts:delete',
  'contacts:list',
  'contacts:importCsv',
  'contacts:setOptOut',
  'lists:list',
  'lists:create',
  'lists:addMembers',
  'templates:list',
  'templates:create',
  'templates:delete',
  'templates:preview',
  'campaigns:list',
  'campaigns:create',
  'campaigns:pause',
  'campaigns:resume',
  'campaigns:progress',
  'autoreply:list',
  'autoreply:create',
  'autoreply:delete',
  'messages:list',
  'messages:send'
]
