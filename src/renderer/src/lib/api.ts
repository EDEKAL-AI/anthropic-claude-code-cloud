// Typed client over the preload bridge. Each call is checked against the IPC contract, so
// a wrong payload or return type is a compile error here rather than a runtime surprise.

import type { IpcChannel, IpcReq, IpcRes } from '@shared/ipc-contract'

function call<C extends IpcChannel>(channel: C, arg: IpcReq<C>): Promise<IpcRes<C>> {
  return window.api.invoke(channel, arg) as Promise<IpcRes<C>>
}

export const api = {
  license: {
    status: () => call('license:status', undefined),
    activate: (token: string) => call('license:activate', { token })
  },
  settings: {
    get: () => call('settings:get', undefined),
    set: (key: string, value: string) => call('settings:set', { key, value })
  },
  dialog: {
    pickMedia: () => call('dialog:pickMedia', undefined)
  },
  accounts: {
    list: () => call('accounts:list', undefined),
    create: (a: IpcReq<'accounts:create'>) => call('accounts:create', a),
    connect: (accountId: string) => call('accounts:connect', { accountId }),
    disconnect: (accountId: string) => call('accounts:disconnect', { accountId }),
    logout: (accountId: string) => call('accounts:logout', { accountId }),
    requestPairingCode: (accountId: string) => call('accounts:requestPairingCode', { accountId }),
    delete: (accountId: string) => call('accounts:delete', { accountId })
  },
  contacts: {
    list: (accountId?: string) => call('contacts:list', { accountId }),
    importCsv: (csv: string, accountId: string | null) => call('contacts:importCsv', { csv, accountId }),
    setOptOut: (contactId: number, optOut: boolean) => call('contacts:setOptOut', { contactId, optOut })
  },
  lists: {
    list: () => call('lists:list', undefined),
    create: (name: string, type: IpcReq<'lists:create'>['type']) => call('lists:create', { name, type }),
    addMembers: (listId: number, contactIds: number[]) => call('lists:addMembers', { listId, contactIds })
  },
  templates: {
    list: () => call('templates:list', undefined),
    create: (a: IpcReq<'templates:create'>) => call('templates:create', a),
    delete: (templateId: number) => call('templates:delete', { templateId }),
    preview: (templateId: number, contactId: number) => call('templates:preview', { templateId, contactId })
  },
  campaigns: {
    list: () => call('campaigns:list', undefined),
    create: (a: IpcReq<'campaigns:create'>) => call('campaigns:create', a),
    pause: (campaignId: number) => call('campaigns:pause', { campaignId }),
    resume: (campaignId: number) => call('campaigns:resume', { campaignId }),
    progress: (campaignId: number) => call('campaigns:progress', { campaignId })
  },
  autoreply: {
    list: (accountId: string) => call('autoreply:list', { accountId }),
    create: (a: IpcReq<'autoreply:create'>) => call('autoreply:create', a),
    delete: (ruleId: number) => call('autoreply:delete', { ruleId })
  },
  messages: {
    list: (accountId: string, limit?: number) => call('messages:list', { accountId, limit }),
    send: (a: IpcReq<'messages:send'>) => call('messages:send', a)
  }
}
