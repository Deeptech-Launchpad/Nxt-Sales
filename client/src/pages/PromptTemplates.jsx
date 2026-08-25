import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, Bot, Check, CheckCircle2, ChevronRight, FileCode, Loader2,
  Lock, Mail, Plus, RotateCcw, Save, Search, Sparkles, Trash2, X,
} from 'lucide-react'
import api from '../api/client'
import RichTextEditor from '../components/RichTextEditor'
import { buildDefaultTemplates, CLIENT_TYPES } from '../utils/emailPromptDefaults'
import '../styles/prompt-templates.css'

export default function PromptTemplates() {
  const [templates, setTemplates] = useState([])
  const [clientType, setClientType] = useState('ecommerce')
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      let { data } = await api.get('/prompt-templates')
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

  const forType = useMemo(() => templates.filter(template => template.clientType === clientType), [templates, clientType])
  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? forType.filter(template => template.label.toLowerCase().includes(query)) : forType
  }, [forType, search])
  const selected = forType.find(template => template.id === selectedId) || forType[0] || null

  useEffect(() => {
    setDraft(selected ? { ...selected } : null)
    setMsg('')
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = draft && selected && (
    draft.label !== selected.label || draft.subject !== selected.subject ||
    draft.content !== selected.content || draft.enabled !== selected.enabled
  )

  const save = async () => {
    if (!draft) return
    setSaving(true); setError(''); setMsg('')
    try {
      const { data } = await api.put(`/prompt-templates/${draft.id}`, {
        label: draft.label, subject: draft.subject, content: draft.content, enabled: draft.enabled,
      })
      setTemplates(previous => previous.map(template => template.id === data.id ? data : template))
      setMsg('Changes saved')
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  const createNew = async () => {
    const label = newName.trim()
    if (!label) return
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'custom'
    let key = base, number = 2
    while (templates.some(template => template.clientType === clientType && template.templateKey === key)) key = `${base}-${number++}`
    setSaving(true); setError('')
    try {
      const { data } = await api.post('/prompt-templates', {
        clientType, templateKey: key, label, kind: 'content', subject: '', content: '',
      })
      setTemplates(previous => [...previous, data])
      setSelectedId(data.id)
      setNewName('')
      setShowCreate(false)
      setMsg('Template created')
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
      setTemplates(previous => previous.filter(template => template.id !== draft.id))
      setSelectedId(null)
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not delete template.')
    } finally {
      setSaving(false)
    }
  }

  const revert = () => { setDraft(selected ? { ...selected } : null); setMsg('') }
  const enabledCount = forType.filter(template => template.enabled).length

  return (
    <main className="pt-page">
      <section className="pt-hero pt-reveal">
        <div className="pt-hero-copy">
          <span className="pt-eyebrow"><Sparkles size={13} /> Marketing workspace</span>
          <h1>Prompt Template Studio</h1>
          <p>Create consistent, high-quality emails and AI prompts your whole team can reuse.</p>
        </div>
        <button type="button" className="pt-new-button" onClick={() => setShowCreate(true)} disabled={loading || saving}>
          <Plus size={17} /> New template
        </button>
        <div className="pt-hero-stats">
          <div><span>Total templates</span><strong>{forType.length}</strong></div>
          <div><span>Enabled</span><strong>{enabledCount}</strong></div>
          <div><span>Workspace</span><strong>{CLIENT_TYPES.find(type => type.value === clientType)?.label}</strong></div>
        </div>
      </section>

      {error && <div className="pt-alert pt-alert--error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}

      {loading ? (
        <div className="pt-loading"><Loader2 size={20} /> Loading your template library…</div>
      ) : (
        <section className="pt-studio pt-reveal pt-delay-1">
          <aside className="pt-library">
            <header>
              <span className="pt-section-kicker">Template library</span>
              <h2>Choose a template</h2>
              <p>Organized by client type and purpose.</p>
            </header>

            <div className="pt-type-switch" role="tablist" aria-label="Client type">
              {CLIENT_TYPES.map(type => (
                <button type="button" role="tab" aria-selected={clientType === type.value} className={clientType === type.value ? 'active' : ''} key={type.value} onClick={() => { setClientType(type.value); setSelectedId(null); setSearch('') }}>
                  {type.label}
                </button>
              ))}
            </div>

            <label className="pt-search"><Search size={14} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search templates" /></label>

            <div className="pt-template-list">
              {visibleTemplates.map(template => {
                const Icon = template.kind === 'ai_prompt' ? Bot : Mail
                return (
                  <button type="button" className={`pt-template-item${selected?.id === template.id ? ' active' : ''}`} key={template.id} onClick={() => setSelectedId(template.id)}>
                    <span className={`pt-template-icon pt-template-icon--${template.kind === 'ai_prompt' ? 'ai' : 'email'}`}><Icon size={16} /></span>
                    <span className="pt-template-copy"><strong>{template.label}</strong><small>{template.kind === 'ai_prompt' ? 'AI system prompt' : 'Email template'}</small></span>
                    <span className={`pt-status-dot${template.enabled ? ' enabled' : ''}`} title={template.enabled ? 'Enabled' : 'Disabled'} />
                    <ChevronRight size={15} />
                  </button>
                )
              })}
              {visibleTemplates.length === 0 && <div className="pt-library-empty">No matching templates.</div>}
            </div>

            <div className="pt-library-foot"><CheckCircle2 size={14} /><span>{enabledCount} of {forType.length} templates available when composing</span></div>
          </aside>

          <article className="pt-editor-panel">
            {draft ? (
              <>
                <header className="pt-editor-head">
                  <div>
                    <div className="pt-editor-badges">
                      <span className={`pt-enabled-badge${draft.enabled ? ' active' : ''}`}><i />{draft.enabled ? 'Enabled' : 'Disabled'}</span>
                      <span className="pt-kind-badge">{draft.kind === 'ai_prompt' ? <Bot size={12} /> : <Mail size={12} />}{draft.kind === 'ai_prompt' ? 'AI prompt' : 'Email template'}</span>
                      {draft.isSystem && <span className="pt-system-badge"><Lock size={11} /> Built-in</span>}
                      {dirty && <span className="pt-unsaved-badge">Unsaved changes</span>}
                    </div>
                    <h2>{draft.label}</h2>
                    <p>Edit the content and control where this template is available.</p>
                  </div>
                  <label className="pt-toggle"><input type="checkbox" checked={!!draft.enabled} onChange={event => setDraft(previous => ({ ...previous, enabled: event.target.checked }))} /><span /><em>{draft.enabled ? 'Active' : 'Inactive'}</em></label>
                </header>

                <div className="pt-editor-body">
                  <div className="pt-field">
                    <label htmlFor="pt-template-name">Template name</label>
                    <input id="pt-template-name" value={draft.label || ''} onChange={event => setDraft(previous => ({ ...previous, label: event.target.value }))} />
                    <small>Use a clear name your team can recognize quickly.</small>
                  </div>

                  {draft.kind === 'content' && (
                    <div className="pt-field">
                      <label htmlFor="pt-template-subject">Email subject</label>
                      <input id="pt-template-subject" value={draft.subject || ''} onChange={event => setDraft(previous => ({ ...previous, subject: event.target.value }))} placeholder="Write a compelling subject line" />
                    </div>
                  )}

                  <div className="pt-field pt-content-field">
                    <div className="pt-field-label"><label>{draft.kind === 'ai_prompt' ? 'AI system prompt' : 'Email body'}</label><span>{draft.content?.length || 0} characters</span></div>
                    {draft.kind === 'ai_prompt' ? (
                      <textarea className="pt-prompt-area" value={draft.content || ''} onChange={event => setDraft(previous => ({ ...previous, content: event.target.value }))} placeholder="Describe how the AI should generate the email…" />
                    ) : (
                      <RichTextEditor value={draft.content || ''} onChange={html => setDraft(previous => ({ ...previous, content: html }))} minHeight={300} placeholder="Write the email as you want it to appear…" />
                    )}
                  </div>

                  <div className="pt-variable-tip">
                    <span><FileCode size={17} /></span>
                    <div><strong>Personalize automatically</strong><p>Insert <code>{'{{clientName}}'}</code> wherever the client’s name should appear. It will be replaced when the email is generated.</p></div>
                  </div>
                </div>

                <footer className="pt-editor-footer">
                  <div className="pt-footer-note">{draft.isSystem ? <><Lock size={13} /> Built-in templates can be edited or disabled, but not deleted.</> : 'Custom template'}</div>
                  <div className="pt-footer-actions">
                    {!draft.isSystem && <button type="button" className="pt-delete" onClick={remove} disabled={saving}><Trash2 size={14} /> Delete</button>}
                    <button type="button" className="pt-revert" onClick={revert} disabled={!dirty || saving}><RotateCcw size={14} /> Revert</button>
                    <button type="button" className="pt-save" onClick={save} disabled={saving || !dirty}>{saving ? <Loader2 size={14} className="pt-spin" /> : <Save size={14} />}{saving ? 'Saving…' : 'Save changes'}</button>
                  </div>
                  {msg && <span className="pt-save-message"><Check size={13} /> {msg}</span>}
                </footer>
              </>
            ) : <div className="pt-no-selection"><FileCode size={28} /><h2>No template selected</h2><p>Choose a template from the library to start editing.</p></div>}
          </article>
        </section>
      )}

      {showCreate && (
        <div className="pt-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowCreate(false) }}>
          <div className="pt-create-dialog" role="dialog" aria-modal="true" aria-labelledby="pt-create-title">
            <button type="button" className="pt-dialog-close" aria-label="Close" onClick={() => setShowCreate(false)}><X size={17} /></button>
            <span className="pt-create-icon"><Plus size={19} /></span>
            <span className="pt-section-kicker">New template</span>
            <h2 id="pt-create-title">Create an email template</h2>
            <p>It will be added to the {CLIENT_TYPES.find(type => type.value === clientType)?.label} library.</p>
            <label>Template name<input autoFocus value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') createNew() }} placeholder="e.g. Product launch follow-up" /></label>
            <div><button type="button" onClick={() => setShowCreate(false)}>Cancel</button><button type="button" className="primary" onClick={createNew} disabled={!newName.trim() || saving}>{saving ? 'Creating…' : 'Create template'}</button></div>
          </div>
        </div>
      )}
    </main>
  )
}
