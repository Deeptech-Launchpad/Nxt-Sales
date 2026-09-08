import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Pencil, Check, X, ListPlus } from 'lucide-react'
import api from '../../api/client'
import { invalidateCustomFieldDefinitions } from '../../hooks/useCustomFieldDefinitions'

const ENTITIES = ['Company', 'Deal', 'Task', 'Meeting']

const TYPE_OPTIONS = [
  { value: 'text',        label: 'Text' },
  { value: 'textarea',    label: 'Textarea' },
  { value: 'number',      label: 'Number' },
  { value: 'email',       label: 'Email' },
  { value: 'phone',       label: 'Phone' },
  { value: 'date',        label: 'Date' },
  { value: 'checkbox',    label: 'Checkbox' },
  { value: 'dropdown',    label: 'Dropdown' },
  { value: 'multiselect', label: 'Multi Select' },
  { value: 'url',         label: 'URL' },
  { value: 'currency',    label: 'Currency' },
  { value: 'percentage',  label: 'Percentage' },
]
const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS.map(t => [t.value, t.label]))
const CHOICE_TYPES = new Set(['dropdown', 'multiselect'])

export default function CustomFieldsManager() {
  const navigate = useNavigate()
  const [entity, setEntity]   = useState(ENTITIES[0])
  const [fields, setFields]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType]   = useState('text')
  const [newRequired, setNewRequired] = useState(false)

  const [editingId, setEditingId]   = useState(null)
  const [editDraft, setEditDraft]   = useState({ label: '', type: 'text', required: false })

  const load = () => {
    setLoading(true)
    api.get(`/custom-fields/${entity}/all`).then(r => setFields(r.data || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [entity])

  const refreshAfterWrite = () => {
    load()
    invalidateCustomFieldDefinitions(entity)
  }

  const addField = async () => {
    const label = newLabel.trim()
    if (!label) return
    setError('')
    try {
      await api.post('/custom-fields', { entity, label, type: newType, required: newRequired })
      setNewLabel(''); setNewType('text'); setNewRequired(false)
      refreshAfterWrite()
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to create field.')
    }
  }

  const toggleEnabled = async (field) => {
    await api.patch(`/custom-fields/${field.id}`, { enabled: !field.enabled })
    refreshAfterWrite()
  }

  const saveEdit = async (field) => {
    const label = editDraft.label.trim()
    if (!label) return
    setError('')
    // type is only sent when it actually changed — the backend rejects a
    // type change once the field has stored values (to protect existing
    // data), and since that rejection short-circuits the whole PATCH, an
    // unrelated label/required edit made at the same time would be lost too
    // if type were always included. Omitting it when unchanged means a
    // label/required-only edit always succeeds regardless of stored values.
    const payload = { label, required: editDraft.required }
    if (editDraft.type !== field.type) payload.type = editDraft.type
    try {
      await api.patch(`/custom-fields/${field.id}`, payload)
      setEditingId(null)
      refreshAfterWrite()
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to save field.')
    }
  }

  const removeField = async (field) => {
    const warning = field.required
      ? `Delete "${field.label}"? It's marked Required and may have stored values on existing ${entity} records — deleting it permanently removes those values too. This cannot be undone.`
      : `Delete "${field.label}"? Any stored values for it on existing ${entity} records will be permanently removed too. This cannot be undone.`
    if (!window.confirm(warning)) return
    setError('')
    try {
      await api.delete(`/custom-fields/${field.id}`)
      refreshAfterWrite()
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to delete field.')
    }
  }

  const move = async (index, direction) => {
    const next = [...fields]
    const swapWith = index + direction
    if (swapWith < 0 || swapWith >= next.length) return
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
    setFields(next)
    try {
      await api.patch('/custom-fields/reorder', { entity, orderedIds: next.map(f => f.id) })
      invalidateCustomFieldDefinitions(entity)
    } catch {
      load()
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <button onClick={() => navigate('/settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
          <ArrowLeft size={18} />
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Custom Fields</h1>
      </div>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 20px 28px' }}>
        Add business-specific fields to Company, Deal, Task, and Meeting records — they appear automatically in Create/Edit forms, Edit Columns, Import/Export, and filters.
      </p>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Left: entity list */}
        <div style={{ width: 200, flexShrink: 0 }}>
          {ENTITIES.map(e => (
            <button
              key={e}
              onClick={() => setEntity(e)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7,
                border: 'none', cursor: 'pointer', fontSize: 13, marginBottom: 2,
                background: entity === e ? '#eff6ff' : 'transparent',
                color: entity === e ? '#1d4ed8' : '#334155',
                fontWeight: entity === e ? 600 : 400,
              }}
            >
              {e} Fields
            </button>
          ))}
        </div>

        {/* Right: fields for the selected entity */}
        <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18 }}>
          {loading ? (
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</p>
          ) : (
            <>
              {error && <p style={{ color: '#ef4444', fontSize: 12.5, marginTop: 0 }}>{error}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {fields.length === 0 && (
                  <p style={{ fontSize: 13, color: '#94a3b8' }}>No custom fields yet for {entity} — add one below.</p>
                )}
                {fields.map((field, i) => (
                  <div key={field.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    border: '1px solid #f1f5f9', borderRadius: 7,
                    opacity: field.enabled ? 1 : 0.5, background: field.enabled ? '#fff' : '#f8fafc',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <button onClick={() => move(i, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#e2e8f0' : '#64748b', padding: 0, lineHeight: 0 }}>
                        <ChevronUp size={14} />
                      </button>
                      <button onClick={() => move(i, 1)} disabled={i === fields.length - 1} style={{ background: 'none', border: 'none', cursor: i === fields.length - 1 ? 'default' : 'pointer', color: i === fields.length - 1 ? '#e2e8f0' : '#64748b', padding: 0, lineHeight: 0 }}>
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    {editingId === field.id ? (
                      <>
                        <input
                          autoFocus
                          value={editDraft.label}
                          onChange={e => setEditDraft(d => ({ ...d, label: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && saveEdit(field)}
                          style={{ flex: 1, padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 5, fontSize: 13 }}
                        />
                        <select
                          value={editDraft.type}
                          onChange={e => setEditDraft(d => ({ ...d, type: e.target.value }))}
                          title="Field type (only changeable while no values are stored for this field)"
                          style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 5, fontSize: 12.5 }}
                        >
                          {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#64748b', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={editDraft.required} onChange={e => setEditDraft(d => ({ ...d, required: e.target.checked }))} />
                          Required
                        </label>
                        <button onClick={() => saveEdit(field)} title="Save" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a' }}><Check size={16} /></button>
                        <button onClick={() => setEditingId(null)} title="Cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
                      </>
                    ) : (
                      <>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 13.5, color: '#0f172a' }}>
                            {field.label}{field.required && <span style={{ color: '#ef4444' }}> *</span>}
                          </span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>
                            {TYPE_LABEL[field.type] || field.type} · key: {field.key}
                          </span>
                        </div>
                        {CHOICE_TYPES.has(field.type) && (
                          <button
                            onClick={() => navigate(`/settings/dropdowns?field=${entity.toLowerCase()}.custom.${field.key}`)}
                            title="Manage values"
                            style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: '1px solid #bfdbfe', color: '#1d4ed8', background: '#eff6ff', cursor: 'pointer' }}
                          >
                            Manage values
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingId(field.id); setEditDraft({ label: field.label, type: field.type, required: field.required }) }}
                          title="Edit field" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => toggleEnabled(field)} title={field.enabled ? 'Disable' : 'Enable'}
                          style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: '1px solid', cursor: 'pointer',
                            borderColor: field.enabled ? '#bbf7d0' : '#e2e8f0', color: field.enabled ? '#16a34a' : '#94a3b8', background: field.enabled ? '#f0fdf4' : '#fff' }}>
                          {field.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                        <button onClick={() => removeField(field)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addField()}
                  placeholder={`Add a new ${entity} field… (e.g. GST Number)`}
                  style={{ flex: 1, minWidth: 200, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}
                />
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value)}
                  style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}
                >
                  {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}>
                  <input type="checkbox" checked={newRequired} onChange={e => setNewRequired(e.target.checked)} />
                  Required
                </label>
                <button onClick={addField} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#fff', background: '#3b82f6', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                  <Plus size={14} /> Add
                </button>
              </div>
              {CHOICE_TYPES.has(newType) && (
                <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <ListPlus size={12} /> After creating a Dropdown/Multi Select field, use "Manage values" to add its option list.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
