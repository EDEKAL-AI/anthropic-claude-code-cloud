import { useEffect, useState } from 'react'
import { useStore } from './store'
import { AccountsPage } from './pages/Accounts'
import { ContactsPage } from './pages/Contacts'
import { TemplatesPage } from './pages/Templates'
import { CampaignsPage } from './pages/Campaigns'
import { InboxPage } from './pages/Inbox'

type Tab = 'accounts' | 'contacts' | 'templates' | 'campaigns' | 'inbox'

const TABS: { id: Tab; label: string }[] = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'templates', label: 'Templates' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'inbox', label: 'Inbox' }
]

export function App() {
  const [tab, setTab] = useState<Tab>('accounts')
  const initEventStream = useStore((s) => s.initEventStream)
  const refreshAccounts = useStore((s) => s.refreshAccounts)

  useEffect(() => {
    initEventStream()
    void refreshAccounts()
  }, [initEventStream, refreshAccounts])

  return (
    <div className="app">
      <nav className="sidebar">
        <h1 style={{ fontSize: 16 }}>WA Marketing</h1>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="content">
        <div className="disclaimer">
          ⚠️ This tool automates WhatsApp via an unofficial API (Baileys). Bulk/automated
          messaging violates WhatsApp's Terms of Service and can get numbers banned. Only
          message contacts who opted in, respect STOP requests, and treat every number as
          disposable.
        </div>
        {tab === 'accounts' && <AccountsPage />}
        {tab === 'contacts' && <ContactsPage />}
        {tab === 'templates' && <TemplatesPage />}
        {tab === 'campaigns' && <CampaignsPage />}
        {tab === 'inbox' && <InboxPage />}
      </main>
    </div>
  )
}
