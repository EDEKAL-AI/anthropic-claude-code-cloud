import { useState } from 'react'
import { api } from '../lib/api'

export function Compliance({ onAccepted }: { onAccepted: () => void }) {
  const [checked, setChecked] = useState(false)

  async function accept(): Promise<void> {
    await api.settings.set('complianceAcceptedAt', String(Date.now()))
    onAccepted()
  }

  return (
    <div style={{ maxWidth: 620, margin: '60px auto', padding: 20 }}>
      <h1>Before you start — please read</h1>
      <div className="card">
        <p>
          This software sends messages through WhatsApp using an <b>unofficial</b> interface.
          Automated and bulk messaging <b>violates WhatsApp's Terms of Service</b> and can
          result in your phone numbers being <b>temporarily or permanently banned</b>.
        </p>
        <ul className="muted" style={{ lineHeight: 1.7 }}>
          <li>Only message people who have explicitly opted in.</li>
          <li>Honour STOP / opt-out requests immediately.</li>
          <li>Keep volumes low, especially on new numbers (warmup).</li>
          <li>Treat every number as disposable — assume it may be banned.</li>
          <li>Comply with local law (GDPR, TCPA, CCPA and similar).</li>
        </ul>
        <p className="muted">
          For deliverability-critical or large-scale use, the official WhatsApp Business
          Cloud API is the only sanctioned option.
        </p>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: 16 }} checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>I understand the risks and accept responsibility for how I use this tool.</span>
        </label>
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={!checked} onClick={() => void accept()}>
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
