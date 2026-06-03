import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { api } from '../lib/api'
import type { Campaign } from '@shared/models'

export function DashboardPage() {
  const accounts = useStore((s) => s.accounts)
  const refreshAccounts = useStore((s) => s.refreshAccounts)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  useEffect(() => {
    void refreshAccounts()
    void api.campaigns.list().then(setCampaigns)
    const t = setInterval(() => {
      void refreshAccounts()
      void api.campaigns.list().then(setCampaigns)
    }, 5000)
    return () => clearInterval(t)
  }, [refreshAccounts])

  const linked = accounts.filter((a) => a.status === 'linked').length
  const banned = accounts.filter((a) => a.status === 'banned').length
  const sentToday = accounts.reduce((sum, a) => sum + a.dailySentCount, 0)
  const running = campaigns.filter((c) => c.status === 'running').length

  const stat = (label: string, value: number | string, accent?: string) => (
    <div className="card" style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  )

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="row" style={{ alignItems: 'stretch' }}>
        {stat('Accounts', accounts.length)}
        {stat('Linked', linked, 'var(--accent)')}
        {stat('Banned', banned, banned ? 'var(--danger)' : undefined)}
        {stat('Sent (24h)', sentToday)}
        {stat('Running campaigns', running)}
      </div>

      <h2>Account health</h2>
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Warmup</th>
            <th>Sent (24h)</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td>{a.label || '—'}</td>
              <td>{a.phone}</td>
              <td>
                <span className={`badge ${a.status}`}>{a.status}</span>
              </td>
              <td>stage {a.warmupStage}</td>
              <td>{a.dailySentCount}</td>
            </tr>
          ))}
          {accounts.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No accounts yet — add one in the Accounts tab.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
