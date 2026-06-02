import type { Database } from 'better-sqlite3'
import { AccountsRepo } from './accounts'
import { ContactsRepo, ListsRepo } from './contacts'
import { TemplatesRepo } from './templates'
import { CampaignsRepo } from './campaigns'
import { MessagesRepo } from './messages'
import { AutoReplyRepo } from './autoreply'
import { SettingsRepo } from './settings'

/** Aggregates all repositories over a single shared connection (single writer). */
export class Repositories {
  readonly accounts: AccountsRepo
  readonly contacts: ContactsRepo
  readonly lists: ListsRepo
  readonly templates: TemplatesRepo
  readonly campaigns: CampaignsRepo
  readonly messages: MessagesRepo
  readonly autoReply: AutoReplyRepo
  readonly settings: SettingsRepo

  constructor(db: Database) {
    this.accounts = new AccountsRepo(db)
    this.contacts = new ContactsRepo(db)
    this.lists = new ListsRepo(db)
    this.templates = new TemplatesRepo(db)
    this.campaigns = new CampaignsRepo(db)
    this.messages = new MessagesRepo(db)
    this.autoReply = new AutoReplyRepo(db)
    this.settings = new SettingsRepo(db)
  }
}

export {
  AccountsRepo,
  ContactsRepo,
  ListsRepo,
  TemplatesRepo,
  CampaignsRepo,
  MessagesRepo,
  AutoReplyRepo,
  SettingsRepo
}
