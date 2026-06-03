import { useState } from 'react'
import { api } from '../lib/api'

export function Activation({ onActivated }: { onActivated: () => void }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function activate(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await api.license.activate(token.trim())
      if (res.ok) onActivated()
      else setError(res.error ?? 'Activation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '80px auto', padding: 20 }}>
      <h1>Activate WhatsApp Marketing</h1>
      <p className="muted">
        Enter the license key provided with your purchase. The key is verified offline — no
        internet connection is required.
      </p>
      <div className="card">
        <div className="field">
          <label>License key</label>
          <textarea rows={4} value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste license key" />
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
        <button className="btn" disabled={busy || !token.trim()} onClick={() => void activate()}>
          {busy ? 'Activating…' : 'Activate'}
        </button>
      </div>
    </div>
  )
}
