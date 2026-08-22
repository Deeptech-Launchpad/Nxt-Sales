import { useState, useEffect, useCallback } from 'react'
import { FileCode, Save, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react'
import api from '../api/client'
import RichTextEditor from '../components/RichTextEditor'
import { buildDefaultTemplates, CLIENT_TYPES } from '../utils/emailPromptDefaults'

// Prompt Templates — its own module under Marketing → Email.
//
// Shows the templates that already existed (both client types, four each) and
// lets them be viewed, edited, saved, and added to. On first open it seeds the
// database from the built-in defaults so nothing is lost and there is only one
// prompt system; seeding uses skipDuplicates server-side, so it can never
// overwrite an edited template.
//
// Email bodies are edited in a visual editor (RichTextEditor) — no one has to
// type <p> or <ul>. AI prompts are plain text, so those stay a plain textarea:
// a rich editor there would inject markup into a prompt that must remain text.
//
// This page is light-themed like the rest of the CRM (Companies/Deals), not
// dark like the Email Tool, because it is a standalone module page.

const CARD = {
  background: '#fff', borderRadius: 12, padding: 24,
  boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
}
const LABEL = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }
const INPUT = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: 13.5, fontFamily: 'inherit', color: '#0f172a',
}

export default function PromptTemplates() {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '20px 24px' }}>
        <FileCode size={20} color="#8b5cf6" />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-.2px' }}>Prompt Templates</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
            Email templates and AI prompts used when composing and generating emails.
          </p>
        </div>
        <button
          onClick={createNew}
          disabled={saving || loading}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#e63329', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: saving || loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          <Plus size={14} /> New template
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 13px' }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ ...CARD, color: '#94a3b8', fontSize: 14 }}>Loading templates…</div>
      ) : (
        <div style={CARD}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={LABEL}>Client Type</label>
              <select
                style={INPUT}
                value={clientType}
                onChange={e => { setClientType(e.target.value); setSelectedId(null) }}
              >
                {CLIENT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 2, minWidth: 260 }}>
              <label style={LABEL}>Template</label>
              <select style={INPUT} value={selected?.id || ''} onChange={e => setSelectedId(e.target.value)}>
                {forType.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.label}{t.kind === 'ai_prompt' ? ' (AI prompt)' : ''}{t.enabled ? '' : ' — disabled'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {draft && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={LABEL}>Name</label>
                <input style={INPUT} value={draft.label || ''} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} />
              </div>

              {draft.kind === 'content' && (
                <div style={{ marginBottom: 16 }}>
                  <label style={LABEL}>Subject</label>
                  <input style={INPUT} value={draft.subject || ''} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} />
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={LABEL}>
                  {draft.kind === 'ai_prompt' ? 'AI system prompt' : 'Email body'}
                </label>
                {draft.kind === 'ai_prompt' ? (
                  // Plain text on purpose — this is a prompt sent to the model,
                  // not an email; rich-text markup would corrupt it.
                  <textarea
                    value={draft.content || ''}
                    onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
                    style={{ ...INPUT, minHeight: 320, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.6 }}
                  />
                ) : (
                  <RichTextEditor
                    value={draft.content || ''}
                    onChange={html => setDraft(d => ({ ...d, content: html }))}
                    minHeight={320}
                    placeholder="Write the email as you want it to look…"
                  />
                )}
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 7 }}>
                  Type <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>{'{{clientName}}'}</code> wherever
                  the client's name should appear — it is replaced automatically when the email is generated.
                </p>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={!!draft.enabled}
                    onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))}
                    style={{ width: 15, height: 15 }}
                  />
                  Enabled — available when composing
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={save}
                  disabled={saving || !dirty}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: 'none', background: dirty && !saving ? '#e63329' : '#e2e8f0', color: dirty && !saving ? '#fff' : '#94a3b8', fontSize: 13.5, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
                >
                  {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  onClick={revert}
                  disabled={!dirty || saving}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 13.5, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
                >
                  <RotateCcw size={13} /> Revert
                </button>
                {!draft.isSystem && (
                  <button
                    onClick={remove}
                    disabled={saving}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
                {msg && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
                    <CheckCircle2 size={14} /> {msg}
                  </span>
                )}
              </div>

              {draft.isSystem && (
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                  This is one of the original built-in templates. It can be edited or disabled, but not deleted —
                  the composer still offers it.
                </p>
              )}
            </>
          )}

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  )
}
