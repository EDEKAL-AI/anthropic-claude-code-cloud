import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { SETTING_DEFAULTS } from '@shared/settings'

const FIELDS: { key: keyof typeof SETTING_DEFAULTS; label: string; hint: string }[] = [
  { key: 'quietStartHour', label: 'Quiet hours start (0-23)', hint: 'No sends from this local hour' },
  { key: 'quietEndHour', label: 'Quiet hours end (0-23)', hint: 'Sends resume at this local hour' },
  { key: 'defaultRateMinMs', label: 'Default min delay (ms)', hint: 'Lower bound between sends' },
  { key: 'defaultRateMaxMs', label: 'Default max delay (ms)', hint: 'Upper bound between sends' },
  { key: 'defaultDailyCap', label: 'Default daily cap', hint: 'Suggested per-campaign daily limit' },
  { key: 'simulateTyping', label: 'Simulate typing (true/false)', hint: 'Show typing before sending' }
]

export function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>(SETTING_DEFAULTS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void api.settings.get().then((v) => setValues({ ...SETTING_DEFAULTS, ...v }))
  }, [])

  async function save(): Promise<void> {
    for (const f of FIELDS) {
      await api.settings.set(f.key, values[f.key] ?? SETTING_DEFAULTS[f.key])
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <h1>Settings</h1>
      <div className="card">
        <h2>Anti-ban defaults</h2>
        <p className="muted">
          These apply to the scheduler's send gate. Lower volumes and wider, randomized
          delays reduce ban risk. Warmup advances one stage per day automatically.
        </p>
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label>
              {f.label} <span className="muted">— {f.hint}</span>
            </label>
            <input
              value={values[f.key] ?? ''}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          </div>
        ))}
        <button className="btn" onClick={() => void save()}>
          {saved ? 'Saved ✓' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}
