import { useState, useEffect, useCallback } from 'react'
import { FileCode, Save, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react'
import api from '../api/client'
import { buildDefaultTemplates, CLIENT_TYPES } from '../utils/emailPromptDefaults'

// Prompt Templates manager (Email Tool → Settings).
//
// Shows the templates that already existed — both client types, four templates
// each — and lets them be viewed, edited, saved, and added to. On first open it
// seeds the database from the built-in defaults so nothing is lost and there is
// only one prompt system; seeding uses skipDuplicates server-side, so it can
// never overwrite an edited template.
//
// Colours use the Email Tool's dark-theme tokens (--et-*) because this renders
// inside .et-root.

const TXT = { color: 'var(--et-txt)' }
const DIM = { color: 'var(--et-txt-s)' }

export default function PromptTemplatesPanel() {
  const [templates, setTemplates] = useState([])
  const [clientType, setClientType] = useState('ecommerce')
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      let { data } = await api.get('/prompt-templates')
      // First run: seed from the built-in defaults, then re-read.
      if (!Array.isArray(data) || data.length === 0) {
        await api.post('/prompt-templates/seed', { templates: buildDefaultTemplates() })
        data = (await api.get('/prompt-templates')).data
      }
      setTemplates(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not load prompt templates.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const forType = templates.filter(t => t.clientType === clientType)
  const selected = forType.find(t => t.id === selectedId) || forType[0] || null

  // Reset the edit buffer whenever the selected template changes.
  useEffect(() => {
    setDraft(selected ? { ...selected } : null)
    setMsg('')
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!draft) return
    setSaving(true); setError(''); setMsg('')
    try {
      const { data } = await api.put(`/prompt-templates/${draft.id}`, {
        label: draft.label,
        subject: draft.subject,
        content: draft.content,
        enabled: draft.enabled,
      })
      setTemplates(prev => prev.map(t => (t.id === data.id ? data : t)))
      setMsg('Saved.')
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const createNew = async () => {
    const label = window.prompt('Name for the new template:')
    if (!label || !label.trim()) return
    // A stable key derived from the name, kept unique per client type.
    const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'custom'
    let key = base, n = 2
    while (templates.some(t => t.clientType === clientType && t.templateKey === key)) key = `${base}-${n++}`
    setSaving(true); setError('')
    try {
      const { data } = await api.post('/prompt-templates', {
        clientType, templateKey: key, label: label.trim(), kind: 'content', subject: '', content: '',
      })
      setTemplates(prev => [...prev, data])
      setSelectedId(data.id)
      setMsg('Template created.')
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not create template.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!draft || draft.isSystem) return
    if (!window.confirm(`Delete "${draft.label}"? This cannot be undone.`)) return
    setSaving(true); setError('')
    try {
      await api.delete(`/prompt-templates/${draft.id}`)
      setTemplates(prev => prev.filter(t => t.id !== draft.id))
      setSelectedId(null)
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not delete template.')
    } finally {
      setSaving(false)
    }
  }

  const revert = () => { setDraft(selected ? { ...selected } : null); setMsg('') }
  const dirty = draft && selected && (
    draft.label !== selected.label || draft.subject !== selected.subject ||
    draft.content !== selected.content || draft.enabled !== selected.enabled
  )

  return (
    <div className="et-settings-card">
      <div className="et-settings-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileCode size={15} color="#A78BFA" />
        Email Prompt Templates
        <button
          className="et-btn"
          style={{ marginLeft: 'auto', flex: 'none', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={createNew}
          disabled={saving || loading}
        >
          <Plus size={13} /> New template
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#FCA5A5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '9px 12px', marginBottom: 12 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /><span>{error}</span>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, ...DIM }}>Loading templates…</p>
      ) : (
        <>
          <div className="et-form-group">
            <label className="et-label">Client Type</label>
            <select
              className="et-input"
              value={clientType}
              onChange={e => { setClientType(e.target.value); setSelectedId(null) }}
            >
              {CLIENT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div className="et-form-group">
            <label className="et-label">Template</label>
            <select
              className="et-input"
              value={selected?.id || ''}
              onChange={e => setSelectedId(e.target.value)}
            >
              {forType.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label}{t.kind === 'ai_prompt' ? ' (AI prompt)' : ''}{t.enabled ? '' : ' — disabled'}
                </option>
              ))}
            </select>
          </div>

          {draft && (
            <>
              <div className="et-form-group">
                <label className="et-label">Name</label>
                <input
                  className="et-input"
                  value={draft.label || ''}
                  onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                />
              </div>

              {draft.kind === 'content' && (
                <div className="et-form-group">
                  <label className="et-label">Subject</label>
                  <input
                    className="et-input"
                    value={draft.subject || ''}
                    onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))}
                  />
                </div>
              )}

              <div className="et-form-group">
                <label className="et-label">
                  {draft.kind === 'ai_prompt' ? 'AI system prompt' : 'Email body (HTML)'}
                </label>
                <textarea
                  className="et-textarea"
                  style={{ minHeight: 260, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.5 }}
                  value={draft.content || ''}
                  onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
                />
                <p className="et-help-text">
                  Use <code>{'{{clientName}}'}</code> wherever the client's name should appear — it is replaced
                  when the email is generated.
                </p>
              </div>

              <div className="et-form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, ...TXT }}>
                  <input
                    type="checkbox"
                    checked={!!draft.enabled}
                    onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))}
                    style={{ width: 15, height: 15 }}
                  />
                  Enabled
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="et-btn et-btn-primary" style={{ flex: 'none', minWidth: 130, display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={save} disabled={saving || !dirty}>
                  {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button className="et-btn" style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={revert} disabled={!dirty || saving}>
                  <RotateCcw size={13} /> Revert
                </button>
                {!draft.isSystem && (
                  <button
                    className="et-btn"
                    style={{ flex: 'none', color: '#FCA5A5', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={remove}
                    disabled={saving}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
                {msg && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#34D399' }}>
                    <CheckCircle2 size={13} /> {msg}
                  </span>
                )}
              </div>

              {draft.isSystem && (
                <p className="et-help-text" style={{ marginTop: 10 }}>
                  This is one of the original built-in templates. It can be edited or disabled, but not deleted —
                  the composer still offers it.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
