import { useEffect, useState } from 'react'
import { useStore } from './store'
import { api } from './lib/api'
import { AccountsPage } from './pages/Accounts'
import { ContactsPage } from './pages/Contacts'
import { TemplatesPage } from './pages/Templates'
import { CampaignsPage } from './pages/Campaigns'
import { InboxPage } from './pages/Inbox'
import { DashboardPage } from './pages/Dashboard'
import { SettingsPage } from './pages/Settings'
import { Activation } from './pages/Activation'
import { Compliance } from './pages/Compliance'
import type { LicenseInfo } from '@shared/models'

type Tab = 'dashboard' | 'accounts' | 'contacts' | 'templates' | 'campaigns' | 'inbox' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'templates', label: 'Templates' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'settings', label: 'Settings' }
]

export function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [license, setLicense] = useState<{ activated: boolean; payload?: LicenseInfo } | null>(null)
  const [accepted, setAccepted] = useState<boolean | null>(null)
  const initEventStream = useStore((s) => s.initEventStream)
  const refreshAccounts = useStore((s) => s.refreshAccounts)

  async function checkLicense(): Promise<void> {
    setLicense(await api.license.status())
  }

  async function checkCompliance(): Promise<void> {
    const settings = await api.settings.get()
    setAccepted(!!settings.complianceAcceptedAt)
  }

  useEffect(() => {
    void checkLicense()
  }, [])

  useEffect(() => {
    if (license?.activated) void checkCompliance()
  }, [license?.activated])

  useEffect(() => {
    if (license?.activated && accepted) {
      initEventStream()
      void refreshAccounts()
    }
  }, [license?.activated, accepted, initEventStream, refreshAccounts])

  if (license === null) {
    return <div style={{ padding: 40 }} className="muted">Loading…</div>
  }

  if (!license.activated) {
    return <Activation onActivated={() => void checkLicense()} />
  }

  if (accepted === null) {
    return <div style={{ padding: 40 }} className="muted">Loading…</div>
  }

  if (!accepted) {
    return <Compliance onAccepted={() => setAccepted(true)} />
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <h1 style={{ fontSize: 16 }}>WA Marketing</h1>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {license.payload && (
          <div className="muted" style={{ fontSize: 11, padding: '8px 12px' }}>
            Licensed to {license.payload.sub}
            <br />
            {license.payload.seats === 0 ? 'Unlimited seats' : `${license.payload.seats} seat(s)`}
          </div>
        )}
      </nav>
      <main className="content">
        <div className="disclaimer">
          ⚠️ This tool automates WhatsApp via an unofficial API (Baileys). Bulk/automated
          messaging violates WhatsApp's Terms of Service and can get numbers banned. Only
          message contacts who opted in, respect STOP requests, and treat every number as
          disposable.
        </div>
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'accounts' && <AccountsPage />}
        {tab === 'contacts' && <ContactsPage />}
        {tab === 'templates' && <TemplatesPage />}
        {tab === 'campaigns' && <CampaignsPage />}
        {tab === 'inbox' && <InboxPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
