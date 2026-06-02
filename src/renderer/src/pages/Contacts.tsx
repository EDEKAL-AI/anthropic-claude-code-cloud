import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Contact, ContactList } from '@shared/models'

export function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [lists, setLists] = useState<ContactList[]>([])
  const [csv, setCsv] = useState('phone,name\n')
  const [listName, setListName] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [targetList, setTargetList] = useState<number | null>(null)

  async function refresh(): Promise<void> {
    setContacts(await api.contacts.list())
    const ls = await api.lists.list()
    setLists(ls)
    if (ls.length && targetList == null) setTargetList(ls[0].id)
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function importCsv(): Promise<void> {
    const res = await api.contacts.importCsv(csv, null)
    alert(`Imported ${res.imported} contacts`)
    await refresh()
  }

  async function createList(): Promise<void> {
    if (!listName.trim()) return
    await api.lists.create(listName.trim(), 'list')
    setListName('')
    await refresh()
  }

  async function addToList(): Promise<void> {
    if (targetList == null || selected.size === 0) return
    await api.lists.addMembers(targetList, [...selected])
    setSelected(new Set())
    alert('Added to list')
  }

  function toggle(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <h1>Contacts</h1>

      <div className="card">
        <h2>Import CSV (header row with phone, optional name)</h2>
        <textarea rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <div style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => void importCsv()}>
            Import
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Lists</h2>
        <div className="row">
          <input
            style={{ maxWidth: 240 }}
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            placeholder="New list name"
          />
          <button className="btn secondary" onClick={() => void createList()}>
            Create list
          </button>
          <span style={{ flex: 1 }} />
          <select value={targetList ?? ''} onChange={(e) => setTargetList(Number(e.target.value))} style={{ maxWidth: 200 }}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button className="btn" disabled={selected.size === 0} onClick={() => void addToList()}>
            Add {selected.size} selected
          </button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th></th>
            <th>Name</th>
            <th>Phone</th>
            <th>Opt-out</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id}>
              <td>
                <input type="checkbox" style={{ width: 16 }} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              </td>
              <td>{c.name || '—'}</td>
              <td>{c.phone}</td>
              <td>
                <input
                  type="checkbox"
                  style={{ width: 16 }}
                  checked={c.optOut}
                  onChange={(e) => void api.contacts.setOptOut(c.id, e.target.checked).then(refresh)}
                />
              </td>
            </tr>
          ))}
          {contacts.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No contacts yet — import a CSV above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
