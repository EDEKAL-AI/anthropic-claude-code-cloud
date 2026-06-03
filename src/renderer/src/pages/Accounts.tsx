import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useStore } from '../store'
import { api } from '../lib/api'
import type { Account } from '@shared/models'

function QrImage({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState('')
  useEffect(() => {
    void QRCode.toDataURL(value, { margin: 1, width: 180 }).then(setDataUrl).catch(() => setDataUrl(''))
  }, [value])
  return dataUrl ? <img src={dataUrl} width={180} height={180} alt="WhatsApp pairing QR" /> : <span className="muted">rendering QR…</span>
}

export function AccountsPage() {
  const accounts = useStore((s) => s.accounts)
  const pairing = useStore((s) => s.pairing)
  const refreshAccounts = useStore((s) => s.refreshAccounts)

  const [phone, setPhone] = useState('')
  const [label, setLabel] = useState('')
  const [primaryKind, setPrimaryKind] = useState<Account['primaryKind']>('emulator')
  const [pairingMethod, setPairingMethod] = useState<Account['pairingMethod']>('code')

  async function createAccount(): Promise<void> {
    if (!phone.trim()) return
    await api.accounts.create({ phone: phone.trim(), label: label.trim(), primaryKind, pairingMethod })
    setPhone('')
    setLabel('')
    await refreshAccounts()
  }

  async function connect(a: Account): Promise<void> {
    // The worker auto-emits a pairing code (code method) or QR (qr method) over the event
    // stream once the socket reaches the connecting state; no explicit request needed here.
    await api.accounts.connect(a.id)
    await refreshAccounts()
  }

  return (
    <div>
      <h1>Accounts</h1>

      <div className="card">
        <h2>Add account</h2>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Phone (E.164, digits only)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="14155550100" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main line" />
          </div>
          <div className="field">
            <label>Primary device</label>
            <select value={primaryKind} onChange={(e) => setPrimaryKind(e.target.value as Account['primaryKind'])}>
              <option value="emulator">Emulator (ADB)</option>
              <option value="phone">Physical phone</option>
            </select>
          </div>
          <div className="field">
            <label>Pairing</label>
            <select
              value={pairingMethod}
              onChange={(e) => setPairingMethod(e.target.value as Account['pairingMethod'])}
            >
              <option value="code">Pairing code</option>
              <option value="qr">QR</option>
            </select>
          </div>
          <button className="btn" onClick={() => void createAccount()}>
            Add
          </button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Warmup</th>
            <th>Sent (24h)</th>
            <th>Pairing</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => {
            const pair = pairing[a.id]
            return (
              <tr key={a.id}>
                <td>{a.label || '—'}</td>
                <td>{a.phone}</td>
                <td>
                  <span className={`badge ${a.status}`}>{a.status}</span>
                </td>
                <td>stage {a.warmupStage}</td>
                <td>{a.dailySentCount}</td>
                <td>
                  {pair?.code && <div className="pairing-code">{pair.code}</div>}
                  {pair?.qr && <QrImage value={pair.qr} />}
                </td>
                <td>
                  <div className="row">
                    {a.status === 'linked' ? (
                      <button className="btn secondary" onClick={() => void api.accounts.logout(a.id).then(refreshAccounts)}>
                        Logout
                      </button>
                    ) : (
                      <button className="btn" onClick={() => void connect(a)}>
                        Connect
                      </button>
                    )}
                    <button className="btn danger" onClick={() => void api.accounts.delete(a.id).then(refreshAccounts)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
          {accounts.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No accounts yet. Add one above, then Connect to pair.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
