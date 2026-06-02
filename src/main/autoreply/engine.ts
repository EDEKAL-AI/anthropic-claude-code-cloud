// Auto-reply engine. For each incoming message it finds the highest-priority matching
// rule, renders the rule's template, and sends the reply through the same rate-limited
// sender used by campaigns. Guards: per-contact cooldown, global enable, opt-out (already
// filtered upstream in the supervisor).

import type { Repositories } from '../db/repositories'
import { findMatchingRule } from '@shared/logic/autoreply'
import { renderTemplate } from '@shared/logic/template'
import type { IncomingMessage } from '../accounts/supervisor'

const COOLDOWN_MS = 5 * 60_000

type SendFn = (accountId: string, jid: string, content: { text: string }) => Promise<string | null>

export class AutoReplyEngine {
  constructor(
    private repos: Repositories,
    private send: SendFn
  ) {}

  async handle(msg: IncomingMessage): Promise<void> {
    if (!msg.text || !msg.fromJid) return

    const rules = this.repos.autoReply.list(msg.accountId)
    if (rules.length === 0) return

    const rule = findMatchingRule(rules, msg.text)
    if (!rule) return

    // Per-contact cooldown to avoid reply storms.
    if (msg.contactId != null) {
      const last = this.repos.autoReply.lastRepliedAt(msg.accountId, msg.contactId)
      if (last && Date.now() - new Date(last).getTime() < COOLDOWN_MS) return
    }

    const template = this.repos.templates.get(rule.templateId)
    if (!template) return

    const contact = msg.contactId != null ? this.repos.contacts.get(msg.contactId) : null
    const body = renderTemplate(template.body, {
      name: contact?.name ?? '',
      phone: contact?.phone ?? msg.fromPhone ?? ''
    })

    const waMessageId = await this.send(msg.accountId, msg.fromJid, { text: body })

    this.repos.messages.log({
      accountId: msg.accountId,
      direction: 'out',
      contactId: msg.contactId,
      waMessageId,
      body,
      status: 'auto-reply'
    })

    if (msg.contactId != null) {
      this.repos.autoReply.recordReply(msg.accountId, msg.contactId)
    }
  }
}
