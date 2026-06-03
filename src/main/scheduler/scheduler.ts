// The send loop. A node-cron tick periodically reconciles crash-orphaned jobs, then for
// each connected account claims a small batch of due jobs and dispatches them sequentially
// (concurrency 1 per account) through the anti-ban send gate. Pacing comes from the
// randomized scheduled_for spread plus the gate; the tick just drains what is due.

import cron, { type ScheduledTask } from 'node-cron'
import type { Repositories } from '../db/repositories'
import type { Supervisor } from '../accounts/supervisor'
import { evaluateSendGate } from '@shared/logic/rate-limiter'
import { renderTemplate } from '@shared/logic/template'
import type { OutgoingContent } from '@shared/events'

const TICK_CRON = '*/20 * * * * *' // every 20 seconds
const BATCH_PER_ACCOUNT = 5
const LEASE_MS = 5 * 60_000

export class Scheduler {
  private task: ScheduledTask | null = null
  private warmupTask: ScheduledTask | null = null
  private ticking = false

  constructor(
    private repos: Repositories,
    private supervisor: Supervisor
  ) {}

  start(): void {
    // Reconcile any jobs left 'running' by a previous crash before the first tick.
    this.repos.campaigns.reconcileStuckJobs(LEASE_MS)
    this.task = cron.schedule(TICK_CRON, () => {
      void this.tick()
    })
    // Daily warmup ramp at 03:00 local: advance every linked account one step.
    this.warmupTask = cron.schedule('0 3 * * *', () => {
      this.repos.accounts.advanceWarmupForLinked()
    })
  }

  stop(): void {
    this.task?.stop()
    this.warmupTask?.stop()
    this.task = null
    this.warmupTask = null
  }

  private quietHours(): { startHour: number; endHour: number } {
    return {
      startHour: this.repos.settings.getNumber('quietStartHour', 2),
      endHour: this.repos.settings.getNumber('quietEndHour', 6)
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return // never overlap ticks
    this.ticking = true
    try {
      this.repos.campaigns.reconcileStuckJobs(LEASE_MS)
      const accounts = this.repos.campaigns.accountsWithPendingJobs()
      for (const accountId of accounts) {
        if (!this.supervisor.isConnected(accountId)) continue
        await this.drainAccount(accountId)
      }
    } finally {
      this.ticking = false
    }
  }

  private async drainAccount(accountId: string): Promise<void> {
    const nowIso = new Date().toISOString()
    const jobs = this.repos.campaigns.claimDueJobs(accountId, nowIso, BATCH_PER_ACCOUNT)
    if (jobs.length === 0) return

    const account = this.repos.accounts.get(accountId)
    if (!account) return

    for (const job of jobs) {
      const gate = evaluateSendGate({
        dailySentCount: this.repos.accounts.get(accountId)?.dailySentCount ?? 0,
        warmupStage: account.warmupStage,
        campaignDailyCap: this.repos.campaigns.get(job.campaignId)?.dailyCap ?? 200,
        localHour: new Date().getHours(),
        quietHours: this.quietHours()
      })

      if (!gate.allowed) {
        // Not allowed right now: push this and the rest back to pending for a later tick.
        this.repos.campaigns.markJob(job.id, 'pending')
        break
      }

      const content = this.buildContentForJob(job.campaignId, job.contactId)
      if (!content) {
        this.repos.campaigns.markJob(job.id, 'skipped', { error: 'missing template/contact' })
        continue
      }

      try {
        const contact = this.repos.contacts.get(job.contactId)!
        const jid = `${contact.phone}@s.whatsapp.net`
        const simulateTyping = this.repos.settings.get('simulateTyping') !== 'false'
        const waMessageId = await this.supervisor.sendMessage(accountId, jid, content, simulateTyping)
        this.repos.campaigns.markJob(job.id, 'sent', { waMessageId: waMessageId ?? undefined })
        this.repos.accounts.recordSend(accountId)
        this.repos.messages.log({
          accountId,
          direction: 'out',
          contactId: job.contactId,
          waMessageId,
          body: content.text ?? content.caption ?? null,
          mediaPath: content.mediaPath ?? null,
          status: 'campaign'
        })
      } catch (err) {
        this.repos.campaigns.markJob(job.id, 'failed', { error: (err as Error).message })
      }
    }

    this.finalizeCampaignsFor(accountId)
  }

  private buildContentForJob(campaignId: number, contactId: number): OutgoingContent | null {
    const campaign = this.repos.campaigns.get(campaignId)
    if (!campaign) return null
    const template = this.repos.templates.get(campaign.templateId)
    const contact = this.repos.contacts.get(contactId)
    if (!template || !contact) return null

    const rendered = renderTemplate(template.body, {
      name: contact.name ?? '',
      phone: contact.phone
    })

    if (template.mediaPath) {
      return {
        mediaPath: template.mediaPath,
        mediaType: (template.mediaType as OutgoingContent['mediaType']) ?? 'image',
        caption: rendered
      }
    }
    return { text: rendered }
  }

  /** Mark non-recurring campaigns done once they have no pending/running jobs left. */
  private finalizeCampaignsFor(accountId: string): void {
    const campaigns = this.repos.campaigns.list().filter((c) => c.accountId === accountId && c.status === 'running')
    for (const c of campaigns) {
      if (c.recurrence) continue
      const prog = this.repos.campaigns.progress(c.id)
      if (prog.total > 0 && prog.pending === 0) {
        this.repos.campaigns.setStatus(c.id, 'done')
      }
    }
  }
}
