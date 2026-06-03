// Campaign lifecycle: creating a campaign materializes one job per (sendable) recipient
// with a spread-out scheduled_for, so sends are durable and resumable across restarts.

import type { Repositories } from '../db/repositories'
import { materializeJobs } from '@shared/logic/schedule'
import type { Campaign } from '@shared/models'

export class CampaignService {
  constructor(private repos: Repositories) {}

  create(input: {
    accountId: string
    name: string
    templateId: number
    listId: number
    scheduledAt: string | null
    recurrence: string | null
    rateMinMs: number
    rateMaxMs: number
    dailyCap: number
  }): Campaign {
    // Validate the schedule timestamp up front so we never persist a campaign whose job
    // set can't be materialized (an invalid date would yield NaN).
    let startAt = Date.now()
    if (input.scheduledAt) {
      const parsed = new Date(input.scheduledAt).getTime()
      if (Number.isNaN(parsed)) throw new Error('invalid scheduledAt')
      startAt = parsed
    }
    const campaign = this.repos.campaigns.create(input)
    // Recurring campaigns are populated by the scheduler's cron job on each fire; one-shot
    // campaigns materialize their batch now (or at the scheduled start).
    if (!input.recurrence) {
      this.materialize(campaign.id, startAt)
    }
    return campaign
  }

  /** (Re)build the pending job set for a campaign from its list, starting at `startAtMs`. */
  materialize(campaignId: number, startAtMs: number): number {
    const campaign = this.repos.campaigns.get(campaignId)
    if (!campaign) return 0
    const members = this.repos.lists.membersForSend(campaign.listId)
    if (members.length === 0) return 0

    const jobs = materializeJobs({
      contactIds: members.map((m) => m.id),
      startAt: startAtMs,
      rateMinMs: campaign.rateMinMs,
      rateMaxMs: campaign.rateMaxMs
    })

    this.repos.campaigns.insertJobs(
      jobs.map((j) => ({
        campaignId,
        contactId: j.contactId,
        scheduledFor: new Date(j.scheduledForMs).toISOString()
      }))
    )
    return jobs.length
  }

  pause(campaignId: number): void {
    this.repos.campaigns.setStatus(campaignId, 'paused')
  }

  resume(campaignId: number): void {
    this.repos.campaigns.setStatus(campaignId, 'running')
  }
}
