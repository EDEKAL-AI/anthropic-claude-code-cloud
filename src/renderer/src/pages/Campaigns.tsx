import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { api } from '../lib/api'
import type { Campaign, ContactList, Template } from '@shared/models'

interface ProgressMap {
  [campaignId: number]: { total: number; sent: number; failed: number; pending: number }
}

export function CampaignsPage() {
  const accounts = useStore((s) => s.accounts)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [lists, setLists] = useState<ContactList[]>([])
  const [progress, setProgress] = useState<ProgressMap>({})

  const [form, setForm] = useState({
    accountId: '',
    name: '',
    templateId: 0,
    listId: 0,
    scheduledAt: '',
    recurrence: '',
    rateMinMs: 8000,
    rateMaxMs: 25000,
    dailyCap: 200
  })

  async function refresh(): Promise<void> {
    const [cs, ts, ls] = await Promise.all([api.campaigns.list(), api.templates.list(), api.lists.list()])
    setCampaigns(cs)
    setTemplates(ts)
    setLists(ls)
    const prog: ProgressMap = {}
    for (const c of cs) prog[c.id] = await api.campaigns.progress(c.id)
    setProgress(prog)
  }

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 5000)
    return () => clearInterval(t)
  }, [])

  async function create(): Promise<void> {
    if (!form.accountId || !form.templateId || !form.listId || !form.name.trim()) {
      alert('Pick an account, template, list and name')
      return
    }
    await api.campaigns.create({
      accountId: form.accountId,
      name: form.name.trim(),
      templateId: form.templateId,
      listId: form.listId,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
      recurrence: form.recurrence.trim() || null,
      rateMinMs: form.rateMinMs,
      rateMaxMs: form.rateMaxMs,
      dailyCap: form.dailyCap
    })
    await refresh()
  }

  return (
    <div>
      <h1>Campaigns</h1>

      <div className="card">
        <h2>New campaign</h2>
        <div className="row">
          <div className="field">
            <label>Account</label>
            <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label || a.phone}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Template</label>
            <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: Number(e.target.value) })}>
              <option value={0}>—</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>List</label>
            <select value={form.listId} onChange={(e) => setForm({ ...form, listId: Number(e.target.value) })}>
              <option value={0}>—</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Schedule (optional)</label>
            <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          </div>
          <div className="field">
            <label>Recurring (cron, optional)</label>
            <input
              value={form.recurrence}
              onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
              placeholder="0 10 * * 1"
            />
          </div>
          <div className="field">
            <label>Delay min (ms)</label>
            <input type="number" value={form.rateMinMs} onChange={(e) => setForm({ ...form, rateMinMs: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Delay max (ms)</label>
            <input type="number" value={form.rateMaxMs} onChange={(e) => setForm({ ...form, rateMaxMs: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Daily cap</label>
            <input type="number" value={form.dailyCap} onChange={(e) => setForm({ ...form, dailyCap: Number(e.target.value) })} />
          </div>
          <button className="btn" onClick={() => void create()}>
            Create
          </button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Progress</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const p = progress[c.id] ?? { total: 0, sent: 0, failed: 0, pending: 0 }
            return (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  <span className="badge connecting">{c.status}</span>
                </td>
                <td>
                  {p.sent}/{p.total} sent{p.failed ? `, ${p.failed} failed` : ''} ({p.pending} pending)
                </td>
                <td>
                  <div className="row">
                    {c.status === 'running' ? (
                      <button className="btn secondary" onClick={() => void api.campaigns.pause(c.id).then(refresh)}>
                        Pause
                      </button>
                    ) : (
                      <button className="btn" onClick={() => void api.campaigns.resume(c.id).then(refresh)}>
                        Resume
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
