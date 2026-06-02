import { useEffect, useState, useCallback } from 'react'
import { useStore } from '../store'
import { api } from '../lib/api'
import type { MessageLog } from '@shared/models'

export function InboxPage() {
  const accounts = useStore((s) => s.accounts)
  const [accountId, setAccountId] = useState('')
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [toPhone, setToPhone] = useState('')
  const [text, setText] = useState('')

  const refresh = useCallback(async () => {
    if (!accountId) return
    setMessages(await api.messages.list(accountId, 100))
  }, [accountId])

  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0].id)
  }, [accounts, accountId])

  useEffect(() => {
    void refresh()
    const unsub = window.api.onWorkerEvent((e) => {
      if ((e.type === 'message' || e.type === 'messageStatus') && e.accountId === accountId) void refresh()
    })
    return unsub
  }, [accountId, refresh])

  async function send(): Promise<void> {
    if (!accountId || !toPhone.trim() || !text.trim()) return
    const jid = `${toPhone.replace(/\D/g, '')}@s.whatsapp.net`
    await api.messages.send({ accountId, jid, content: { text } })
    setText('')
    await refresh()
  }

  return (
    <div>
      <h1>Inbox</h1>

      <div className="card">
        <div className="row">
          <div className="field">
            <label>Account</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label || a.phone}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>To (phone)</label>
            <input value={toPhone} onChange={(e) => setToPhone(e.target.value)} placeholder="14155550100" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Message</label>
            <input value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <button className="btn" onClick={() => void send()}>
            Send
          </button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Dir</th>
            <th>Body</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => (
            <tr key={m.id}>
              <td className="muted">{new Date(m.ts).toLocaleString()}</td>
              <td>{m.direction === 'in' ? '⬅ in' : '➡ out'}</td>
              <td>{m.body || (m.mediaPath ? '[media]' : '—')}</td>
              <td className="muted">{m.status}</td>
            </tr>
          ))}
          {messages.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No messages yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
