import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Template } from '@shared/models'
import { renderTemplate } from '@shared/logic/template'

export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [name, setName] = useState('')
  const [body, setBody] = useState('Hi {{name}}, ')
  const [mediaPath, setMediaPath] = useState('')
  const [mediaType, setMediaType] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setTemplates(await api.templates.list())
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function browse(): Promise<void> {
    const res = await api.dialog.pickMedia()
    if (res.path) {
      setMediaPath(res.path)
      setMediaType(res.mediaType)
    }
  }

  async function create(): Promise<void> {
    if (!name.trim() || !body.trim()) return
    await api.templates.create({
      name: name.trim(),
      body,
      mediaPath: mediaPath.trim() || undefined,
      mediaType: mediaPath.trim() ? mediaType ?? 'document' : undefined
    })
    setName('')
    setBody('Hi {{name}}, ')
    setMediaPath('')
    setMediaType(null)
    await refresh()
  }

  return (
    <div>
      <h1>Templates</h1>

      <div className="card">
        <h2>New template</h2>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Body — use {'{{name}}'} and {'{{phone}}'} placeholders</label>
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="field">
          <label>Media (optional){mediaType ? ` — ${mediaType}` : ''}</label>
          <div className="row">
            <input style={{ flex: 1 }} value={mediaPath} onChange={(e) => setMediaPath(e.target.value)} placeholder="/path/to/image.jpg" />
            <button className="btn secondary" onClick={() => void browse()}>
              Browse…
            </button>
          </div>
        </div>
        <div className="muted">Preview: {renderTemplate(body, { name: 'Dana', phone: '14155550100' })}</div>
        <div style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => void create()}>
            Save template
          </button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Body</th>
            <th>Media</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.body}</td>
              <td>{t.mediaPath ? t.mediaType : '—'}</td>
              <td>
                <button className="btn danger" onClick={() => void api.templates.delete(t.id).then(refresh)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
