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
    const campaign = this.repos.campaigns.create(input)
    const startAt = input.scheduledAt ? new Date(input.scheduledAt).getTime() : Date.now()
    this.materialize(campaign.id, startAt)
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
