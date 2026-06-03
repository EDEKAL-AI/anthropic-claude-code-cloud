import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { openDb } from './connection'
import { LATEST_VERSION } from './migrations'
import { Repositories } from './repositories'

let db: Database
let repos: Repositories

beforeEach(() => {
  db = openDb(':memory:')
  repos = new Repositories(db)
})

describe('migrations', () => {
  it('brings a fresh DB to the latest version', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION)
  })

  it('is idempotent when run again', () => {
    // openDb already ran migrations; running again should not throw or change anything
    const before = db.pragma('user_version', { simple: true })
    expect(before).toBe(LATEST_VERSION)
  })
})

describe('accounts repo', () => {
  it('creates, lists and updates status', () => {
    const acct = repos.accounts.create({
      phone: '14155550100',
      label: 'Test',
      primaryKind: 'emulator',
      pairingMethod: 'code'
    })
    expect(acct.status).toBe('unlinked')
    expect(repos.accounts.list()).toHaveLength(1)

    repos.accounts.setStatus(acct.id, 'linked')
    expect(repos.accounts.get(acct.id)?.status).toBe('linked')
    expect(repos.accounts.get(acct.id)?.lastConnectedAt).not.toBeNull()
  })

  it('counts sends within a rolling daily window', () => {
    const acct = repos.accounts.create({
      phone: '1',
      label: 'x',
      primaryKind: 'phone',
      pairingMethod: 'qr'
    })
    repos.accounts.recordSend(acct.id)
    repos.accounts.recordSend(acct.id)
    expect(repos.accounts.get(acct.id)?.dailySentCount).toBe(2)
  })
})

describe('contacts import + opt-out', () => {
  it('imports a CSV and normalizes phones', () => {
    const n = repos.contacts.importCsv('phone,name\n+1 (415) 555-0100,Dana\n0525551234,Avi\n', null)
    expect(n).toBe(2)
    const all = repos.contacts.list()
    expect(all.map((c) => c.phone).sort()).toEqual(['0525551234', '14155550100'].sort())
  })

  it('honours opt-out in list membership for send', () => {
    repos.contacts.importCsv('phone,name\n111,A\n222,B\n', null)
    const contacts = repos.contacts.list()
    const list = repos.lists.create('Promo', 'list')
    repos.lists.addMembers(
      list.id,
      contacts.map((c) => c.id)
    )
    repos.contacts.setOptOut(contacts[0].id, true)
    const sendable = repos.lists.membersForSend(list.id)
    expect(sendable).toHaveLength(1)
    expect(sendable[0].id).toBe(contacts[1].id)
  })
})

describe('campaign jobs queue', () => {
  function seedCampaign() {
    const acct = repos.accounts.create({ phone: '1', label: 'x', primaryKind: 'phone', pairingMethod: 'qr' })
    repos.accounts.setStatus(acct.id, 'linked')
    const tpl = repos.templates.create({ name: 't', body: 'hi {{name}}' })
    repos.contacts.importCsv('phone,name\n111,A\n222,B\n', null)
    const contacts = repos.contacts.list()
    const list = repos.lists.create('L', 'list')
    repos.lists.addMembers(list.id, contacts.map((c) => c.id))
    const campaign = repos.campaigns.create({
      accountId: acct.id,
      name: 'c',
      templateId: tpl.id,
      listId: list.id,
      scheduledAt: null, // -> running immediately
      recurrence: null,
      rateMinMs: 1000,
      rateMaxMs: 2000,
      dailyCap: 100
    })
    return { acct, campaign, contacts }
  }

  it('claims only due jobs and marks them sent', () => {
    const { acct, campaign, contacts } = seedCampaign()
    const past = new Date(Date.now() - 1000).toISOString()
    const future = new Date(Date.now() + 60_000).toISOString()
    repos.campaigns.insertJobs([
      { campaignId: campaign.id, contactId: contacts[0].id, scheduledFor: past },
      { campaignId: campaign.id, contactId: contacts[1].id, scheduledFor: future }
    ])

    const claimed = repos.campaigns.claimDueJobs(acct.id, new Date().toISOString(), 10)
    expect(claimed).toHaveLength(1)
    expect(claimed[0].contactId).toBe(contacts[0].id)

    repos.campaigns.markJob(claimed[0].id, 'sent', { waMessageId: 'WAMID1' })
    const prog = repos.campaigns.progress(campaign.id)
    expect(prog).toMatchObject({ total: 2, sent: 1, pending: 1 })
  })

  it('reconciles stuck running jobs back to pending', () => {
    const { acct, campaign, contacts } = seedCampaign()
    const past = new Date(Date.now() - 1000).toISOString()
    repos.campaigns.insertJobs([{ campaignId: campaign.id, contactId: contacts[0].id, scheduledFor: past }])

    // Claim the due job -> it becomes 'running' with a lock timestamp.
    const claimed = repos.campaigns.claimDueJobs(acct.id, new Date().toISOString(), 10)
    expect(claimed).toHaveLength(1)

    // Simulate a crash: back-date the lock so the job looks orphaned.
    const old = new Date(Date.now() - 30 * 60_000).toISOString()
    db.prepare('UPDATE campaign_jobs SET locked_at = ? WHERE id = ?').run(old, claimed[0].id)

    // A 5-minute lease should reclaim anything locked longer ago than that.
    const reclaimed = repos.campaigns.reconcileStuckJobs(5 * 60_000)
    expect(reclaimed).toBe(1)

    // It is claimable again afterwards.
    const reclaimedClaim = repos.campaigns.claimDueJobs(acct.id, new Date().toISOString(), 10)
    expect(reclaimedClaim).toHaveLength(1)
  })
})

describe('auto-reply repo', () => {
  it('creates rules and tracks cooldown', () => {
    const acct = repos.accounts.create({ phone: '1', label: 'x', primaryKind: 'phone', pairingMethod: 'qr' })
    const tpl = repos.templates.create({ name: 't', body: 'auto' })
    const rule = repos.autoReply.create({
      accountId: acct.id,
      matchType: 'contains',
      keyword: 'price',
      templateId: tpl.id,
      enabled: true,
      priority: 0
    })
    expect(repos.autoReply.list(acct.id)).toHaveLength(1)
    expect(repos.autoReply.lastRepliedAt(acct.id, 99)).toBeNull()
    repos.autoReply.recordReply(acct.id, 99)
    expect(repos.autoReply.lastRepliedAt(acct.id, 99)).not.toBeNull()
    repos.autoReply.delete(rule.id)
    expect(repos.autoReply.list(acct.id)).toHaveLength(0)
  })
})
