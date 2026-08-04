import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Pencil, Check, X } from 'lucide-react'
import api from '../../api/client'
import { invalidateDropdownOptions } from '../../hooks/useDropdownOptions'

// Which fields this system manages is fetched from GET /dropdowns/fields —
// the 9 built-in fields (Company/Deal columns, registered server-side in
// server/src/constants/dropdownFields.js) plus every active custom field of
// type dropdown/multiselect (Dynamic Custom Fields), unioned automatically.
// Creating a new custom dropdown field elsewhere in the app makes it appear
// here with no code change.
function groupFields(flat) {
  const groups = {}
  for (const f of flat) {
    if (!groups[f.group]) groups[f.group] = []
    groups[f.group].push(f)
  }
  return Object.entries(groups).map(([group, fields]) => ({ group, fields }))
}

export default function DropdownManager() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [fieldGroups, setFieldGroups] = useState([])
  const [selectedKey, setSelectedKey] = useState(null)
  const [byField, setByField] = useState({}) // fieldKey -> options[] (includes disabled)
  const [loading, setLoading] = useState(true)
  const [newValue, setNewValue] = useState('')
  const [error, setError]       = useState('')
  const [editingId, setEditingId]   = useState(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [allUsers, setAllUsers] = useState([]) // for the Lead Owner field's user-picker Add UI
  const [pickedUserId, setPickedUserId] = useState('')

  const isLeadOwnerField = selectedKey === 'company.ownerId'

  // Lead Owner's "Add" UI is a picker over real users, not free text — its
  // options are User rows (see server/src/routes/users.js's
  // upsertLeadOwnerOption), so adding one here just registers an existing
  // user as an assignable option, it never creates a new user.
  useEffect(() => {
    if (isLeadOwnerField && allUsers.length === 0) {
      api.get('/users/manage').then(r => setAllUsers(r.data || [])).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeadOwnerField])

  // Field list loads once — a custom field's dropdown/multiselect status
  // doesn't change without a page navigation back here.
  useEffect(() => {
    api.get('/dropdowns/fields').then(r => {
      const flat = r.data || []
      setFieldGroups(groupFields(flat))
      // Deep-link support (Settings → Custom Fields links here with
      // ?field=<fieldKey> right after creating a new dropdown field).
      const requested = searchParams.get('field')
      const initial = (requested && flat.some(f => f.fieldKey === requested)) ? requested : flat[0]?.fieldKey
      if (initial) setSelectedKey(initial)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = () => {
    setLoading(true)
    api.get('/dropdowns').then(r => setByField(r.data || {})).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const options = byField[selectedKey] || []
  const addableUsers = isLeadOwnerField
    ? allUsers.filter(u => !options.some(o => o.value === u.id))
    : []

  const refreshAfterWrite = () => {
    load()
    invalidateDropdownOptions(selectedKey)
  }

  const addValue = async () => {
    const value = newValue.trim()
    if (!value) return
    setError('')
    try {
      await api.post('/dropdowns', { fieldKey: selectedKey, value })
      setNewValue('')
      refreshAfterWrite()
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to add value.')
    }
  }

  const addLeadOwner = async () => {
    const user = allUsers.find(u => u.id === pickedUserId)
    if (!user) return
    setError('')
    try {
      await api.post('/dropdowns', { fieldKey: selectedKey, value: user.id, label: user.name })
      setPickedUserId('')
      refreshAfterWrite()
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to add user.')
    }
  }

  const toggleEnabled = async (opt) => {
    await api.patch(`/dropdowns/${opt.id}`, { enabled: !opt.enabled })
    refreshAfterWrite()
  }

  const saveLabel = async (opt) => {
    const label = editingLabel.trim()
    if (label) await api.patch(`/dropdowns/${opt.id}`, { label })
    setEditingId(null)
    refreshAfterWrite()
  }

  const removeValue = async (opt) => {
    setError('')
    try {
      await api.delete(`/dropdowns/${opt.id}`)
      refreshAfterWrite()
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to delete value.')
    }
  }

  const move = async (index, direction) => {
    const next = [...options]
    const swapWith = index + direction
    if (swapWith < 0 || swapWith >= next.length) return
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
    setByField(prev => ({ ...prev, [selectedKey]: next }))
    try {
      await api.patch('/dropdowns/reorder', { orderedIds: next.map(o => o.id) })
      invalidateDropdownOptions(selectedKey)
    } catch {
      load() // reorder failed — fall back to the server's real order
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <button onClick={() => navigate('/settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
          <ArrowLeft size={18} />
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Dropdown Lists</h1>
      </div>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 20px 28px' }}>
        Add, edit, reorder, enable/disable the values used across Company and Deal forms, filters, and Bulk Import.
      </p>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Left: field list */}
        <div style={{ width: 240, flexShrink: 0 }}>
          {fieldGroups.map(g => (
            <div key={g.group} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 10px 6px' }}>
                {g.group}
              </div>
              {g.fields.map(f => (
                <button
                  key={f.fieldKey}
                  onClick={() => setSelectedKey(f.fieldKey)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7,
                    border: 'none', cursor: 'pointer', fontSize: 13, marginBottom: 2,
                    background: selectedKey === f.fieldKey ? '#eff6ff' : 'transparent',
                    color: selectedKey === f.fieldKey ? '#1d4ed8' : '#334155',
                    fontWeight: selectedKey === f.fieldKey ? 600 : 400,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Right: values for the selected field */}
        <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18 }}>
          {loading ? (
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</p>
          ) : (
            <>
              {error && <p style={{ color: '#ef4444', fontSize: 12.5, marginTop: 0 }}>{error}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {options.length === 0 && (
                  <p style={{ fontSize: 13, color: '#94a3b8' }}>No values yet — add one below.</p>
                )}
                {options.map((opt, i) => (
                  <div key={opt.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    border: '1px solid #f1f5f9', borderRadius: 7,
                    opacity: opt.enabled ? 1 : 0.5, background: opt.enabled ? '#fff' : '#f8fafc',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <button onClick={() => move(i, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#e2e8f0' : '#64748b', padding: 0, lineHeight: 0 }}>
                        <ChevronUp size={14} />
                      </button>
                      <button onClick={() => move(i, 1)} disabled={i === options.length - 1} style={{ background: 'none', border: 'none', cursor: i === options.length - 1 ? 'default' : 'pointer', color: i === options.length - 1 ? '#e2e8f0' : '#64748b', padding: 0, lineHeight: 0 }}>
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    {editingId === opt.id ? (
                      <>
                        <input
                          autoFocus
                          value={editingLabel}
                          onChange={e => setEditingLabel(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveLabel(opt)}
                          style={{ flex: 1, padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 5, fontSize: 13 }}
                        />
                        <button onClick={() => saveLabel(opt)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a' }}><Check size={16} /></button>
                        <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: 13.5, color: '#0f172a' }}>{opt.label}</span>
                        <button onClick={() => { setEditingId(opt.id); setEditingLabel(opt.label) }} title="Rename" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => toggleEnabled(opt)} title={opt.enabled ? 'Disable' : 'Enable'}
                          style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: '1px solid', cursor: 'pointer',
                            borderColor: opt.enabled ? '#bbf7d0' : '#e2e8f0', color: opt.enabled ? '#16a34a' : '#94a3b8', background: opt.enabled ? '#f0fdf4' : '#fff' }}>
                          {opt.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                        <button onClick={() => removeValue(opt)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {isLeadOwnerField ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={pickedUserId}
                    onChange={e => setPickedUserId(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, color: pickedUserId ? '#0f172a' : '#94a3b8' }}
                  >
                    <option value="">
                      {addableUsers.length === 0 ? 'All users are already added' : 'Select a user to add…'}
                    </option>
                    {addableUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                  <button
                    onClick={addLeadOwner}
                    disabled={!pickedUserId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#fff',
                      background: pickedUserId ? '#3b82f6' : '#93c5fd', border: 'none', borderRadius: 6,
                      cursor: pickedUserId ? 'pointer' : 'default',
                    }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addValue()}
                    placeholder="Add a new value…"
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}
                  />
                  <button onClick={addValue} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#fff', background: '#3b82f6', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    <Plus size={14} /> Add
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
