// Registers every renderer->main IPC handler against the typed IpcRequests contract.
// Handlers are thin: they delegate to repositories, the supervisor, or services.

import { ipcMain } from 'electron'
import type { Repositories } from '../db/repositories'
import type { Supervisor } from '../accounts/supervisor'
import type { CampaignService } from '../scheduler/campaign-service'
import type { LicenseService } from '../license/service'
import { renderTemplate } from '@shared/logic/template'
import { SETTING_KEYS, SETTING_DEFAULTS, isPublicSettingKey } from '@shared/settings'
import type { IpcChannel, IpcReq, IpcRes } from '@shared/ipc-contract'

export interface IpcContext {
  repos: Repositories
  supervisor: Supervisor
  campaigns: CampaignService
  license: LicenseService
}

// Typed wrapper so each handler's argument/return types are checked against the contract.
function handle<C extends IpcChannel>(
  channel: C,
  fn: (arg: IpcReq<C>) => IpcRes<C> | Promise<IpcRes<C>>
): void {
  ipcMain.handle(channel, async (_event, arg) => fn(arg as IpcReq<C>))
}

export function registerIpc(ctx: IpcContext): void {
  const { repos, supervisor, campaigns, license } = ctx

  // ---- License / activation ----
  handle('license:status', () => license.status())
  handle('license:activate', (a) => license.activate(a.token))

  // ---- Global settings (UI-editable keys only; never leak secrets) ----
  handle('settings:get', () => {
    const all = repos.settings.all()
    const out: Record<string, string> = { ...SETTING_DEFAULTS }
    for (const key of SETTING_KEYS) {
      if (all[key] != null) out[key] = all[key]
    }
    return out
  })
  handle('settings:set', (a) => {
    if (!isPublicSettingKey(a.key)) throw new Error(`not a writable setting: ${a.key}`)
    repos.settings.set(a.key, a.value)
  })

  // ---- Accounts ----
  handle('accounts:list', () => repos.accounts.list())
  handle('accounts:create', (a) => {
    // Enforce the licensed seat count (0 = unlimited).
    const seats = license.seats()
    if (seats > 0 && repos.accounts.list().length >= seats) {
      throw new Error(`License limit reached: ${seats} account seat(s)`)
    }
    return repos.accounts.create(a)
  })
  handle('accounts:connect', async (a) => {
    await supervisor.connect(a.accountId)
  })
  handle('accounts:disconnect', async (a) => {
    await supervisor.disconnect(a.accountId)
  })
  handle('accounts:logout', async (a) => {
    await supervisor.logout(a.accountId)
  })
  handle('accounts:requestPairingCode', async (a) => ({
    code: await supervisor.requestPairingCode(a.accountId)
  }))
  handle('accounts:delete', async (a) => {
    await supervisor.disconnect(a.accountId).catch(() => {})
    repos.accounts.delete(a.accountId)
  })

  // ---- Contacts & lists ----
  handle('contacts:list', (a) => repos.contacts.list(a.accountId))
  handle('contacts:importCsv', (a) => ({ imported: repos.contacts.importCsv(a.csv, a.accountId) }))
  handle('contacts:setOptOut', (a) => {
    repos.contacts.setOptOut(a.contactId, a.optOut)
  })
  handle('lists:list', () => repos.lists.list())
  handle('lists:create', (a) => repos.lists.create(a.name, a.type))
  handle('lists:addMembers', (a) => {
    repos.lists.addMembers(a.listId, a.contactIds)
  })

  // ---- Templates ----
  handle('templates:list', () => repos.templates.list())
  handle('templates:create', (a) => repos.templates.create(a))
  handle('templates:delete', (a) => {
    repos.templates.delete(a.templateId)
  })
  handle('templates:preview', (a) => {
    const template = repos.templates.get(a.templateId)
    const contact = repos.contacts.get(a.contactId)
    if (!template) throw new Error('template not found')
    const body = renderTemplate(template.body, {
      name: contact?.name ?? '',
      phone: contact?.phone ?? ''
    })
    return { body }
  })

  // ---- Campaigns ----
  handle('campaigns:list', () => repos.campaigns.list())
  handle('campaigns:create', (a) => campaigns.create(a))
  handle('campaigns:pause', (a) => {
    campaigns.pause(a.campaignId)
  })
  handle('campaigns:resume', (a) => {
    campaigns.resume(a.campaignId)
  })
  handle('campaigns:progress', (a) => repos.campaigns.progress(a.campaignId))

  // ---- Auto-reply ----
  handle('autoreply:list', (a) => repos.autoReply.list(a.accountId))
  handle('autoreply:create', (a) => repos.autoReply.create(a))
  handle('autoreply:delete', (a) => {
    repos.autoReply.delete(a.ruleId)
  })

  // ---- Messages / inbox ----
  handle('messages:list', (a) => repos.messages.list(a.accountId, a.limit))
  handle('messages:send', async (a) => {
    const waMessageId = await supervisor.sendMessage(a.accountId, a.jid, a.content)
    repos.messages.log({
      accountId: a.accountId,
      direction: 'out',
      waMessageId,
      body: a.content.text ?? a.content.caption ?? null,
      mediaPath: a.content.mediaPath ?? null,
      status: 'manual'
    })
  })
}
