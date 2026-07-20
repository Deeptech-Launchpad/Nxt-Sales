import { useState, useEffect, useRef } from 'react'
import {
  X, Mail, Send, Loader2, CheckCircle, AlertCircle,
  ChevronDown, Eye, EyeOff, Paperclip, Sparkles, Settings2, Trash2,
} from 'lucide-react'
import api from '../../api/client'
import { useDraggable } from '../../hooks/useDraggable'
import '../../styles/activity-modals.css'
import DeliverabilityReport from './DeliverabilityReport'
import { runDeliverabilityAnalysis } from '../../utils/emailDeliverability'
import { compressImageIfNeeded } from '../../utils/imageCompress'

// ── Templates ─────────────────────────────────────────────
const TEMPLATES = [
  { value: 'manual',    label: 'Manual Compose',              needsBeforeAfter: false },
  { value: '1',         label: 'PDP Pitch – New Client',      needsBeforeAfter: true  },
  { value: '2',         label: 'Client Project References',   needsBeforeAfter: false },
  { value: '3',         label: 'AI PDP Audit',                needsBeforeAfter: true  },
  { value: '4',         label: 'Free POC Offer (20 SKUs)',     needsBeforeAfter: false },
]

function buildTemplateContent(template, clientName) {
  const n = clientName || 'Client'
  if (template === '1') {
    return {
      subject: 'Elevate Your eCommerce Performance with Product Data Enrichment (Before & After Sample)',
      html: `<p>Hi ${n},</p>
<p>Hope you're doing well.</p>
<p>I've attached a Before-and-After Product Data Enrichment sample to clearly demonstrate how structured, enriched product data transforms an eCommerce product page—both for buyers and for Google search visibility.</p>
<p><strong>What the Before vs After Sample Shows</strong></p>
<ul>
  <li>Structured product titles (brand + product type + key specifications)</li>
  <li>Clean, standardized specifications (Material, size, dimensions, standards…)</li>
  <li>Clear attribute mapping that supports filters and faceted navigation</li>
  <li>Improved content hierarchy (technical specs, features, applications)</li>
  <li>Consistent SKU, category, and taxonomy alignment</li>
  <li>Richer product context for both users and search engines</li>
</ul>
<p><strong>How This Helps Google Rank Your Store Organically</strong></p>
<p>✅ Helping Google clearly understand what the product is and who it's for<br>
✅ Improving indexing accuracy through standardized attributes and schema-ready data<br>
✅ Strengthening category relevance and internal linking<br>
✅ Increasing time on page and engagement through clearer product information</p>
<p><strong>AltiusNXT's Core Expertise – Product Data Enrichment</strong></p>
<p>✅ Product data enrichment, cleansing, and normalization<br>
✅ Taxonomy design and attribute modeling<br>
✅ SEO-ready product specifications and content structuring<br>
✅ Data standardization across large and complex catalogs</p>
<p>Would you be open to a 15–20 minute call this week to review the sample and discuss how product data enrichment can support your eCommerce growth goals?</p>
<p>Best regards,<br>AltiusNXT Technologies</p>`,
    }
  }
  if (template === '2') {
    return {
      subject: 'AltiusNXT – Client Project References for Your Review',
      html: `<p>Hi ${n},</p>
<p>Good day!</p>
<p>I'm sharing a selection of our client project references for your review. These examples highlight the consistent value and results we deliver.</p>
<p><strong>Client Projects – Product Data Enrichment:</strong></p>
<ul>
  <li><strong>ABC Supply Co. Inc.</strong> – Product Data Enrichment – <a href="https://www.abcsupply.com/">View Project</a></li>
  <li><strong>W.W. Grainger, Inc.</strong> – Product Data Enrichment – <a href="https://www.grainger.com/">View Project</a></li>
  <li><strong>Rubix</strong> – Product Data Enrichment – <a href="https://uk.rubix.com/">View Project</a></li>
  <li><strong>Travis Perkins</strong> – Product Data Enrichment – <a href="https://www.travisperkins.co.uk/">View Project</a></li>
</ul>
<p><strong>Client Projects – eCommerce Store Development &amp; Product Data Enrichment:</strong></p>
<ul>
  <li><strong>Screwman</strong> – Full eCommerce Store Development &amp; Product Data Enrichment – <a href="https://screwman.co.za/">View Store</a></li>
  <li><strong>Rose Scientific</strong> – Full eCommerce Store Development &amp; Product Data Enrichment – <a href="https://www.rosesci.com/">View Store</a></li>
</ul>
<p>We're also open to a retainer engagement model to ensure flexibility and alignment with your operational needs.</p>
<p>Wishing you a wonderful day ahead!</p>
<p>Best regards,<br>AltiusNXT Technologies</p>`,
    }
  }
  if (template === '4') {
    return {
      subject: 'Complimentary Product Data Enrichment – 20 SKUs at No Cost (Proof of Concept)',
      html: `<p>Hi ${n},</p>
<p>Good day!</p>
<p>To help you evaluate the quality and business impact of our Product Data Enrichment services firsthand, I would be happy to enrich up to <strong>20 of your products at no cost</strong> as a Proof of Concept (POC).</p>
<p><strong>What You'll Receive</strong></p>
<p>→ We will enrich 20 selected SKUs using our proven enrichment framework.<br>
→ The enriched products will be uploaded into our demo environment, allowing you to review them in a live storefront experience.<br>
→ I will personally conduct a live walkthrough session, where we will review each enriched product together.</p>
<p>✓ No Risk. No Obligation. Complete Transparency.</p>
<p><strong>Details Required to Begin</strong></p>
<p>Please share the following for each SKU:<br>
✓ Manufacturer Name<br>
✓ Manufacturer Part Number<br>
✓ Product Short Description (if available)</p>
<p>I would welcome the opportunity to schedule a brief Google Meet call to discuss your requirements and align on next steps.</p>
<p>Looking forward to your feedback!</p>
<p>Best regards,<br>AltiusNXT Technologies</p>`,
    }
  }
  return { subject: '', html: '' }
}

// ── AI PDP Audit generator ────────────────────────────────
async function generateAiPdpAudit(clientName, aiProvider, aiKey) {
  const prompt = `You are an expert eCommerce product data consultant writing a professional sales email.
Write a detailed HTML email for a client named "${clientName || 'the client'}" about AltiusNXT Technologies' PDP (Product Detail Page) Audit service.
The email should:
- Open with a professional greeting
- Explain what a PDP Audit is and why it matters for eCommerce SEO and conversions
- List 5-7 specific data quality issues typically found during a PDP Audit
- Explain how AltiusNXT fixes these issues
- Reference the Before/After screenshots attached to this email
- Close with a call to action for a 15-20 minute discovery call
Format as clean HTML with <p>, <ul>, <li>, <strong> tags. No CSS needed.`

  if (aiProvider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
      }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error?.message || 'OpenAI error')
    return d.choices[0].message.content
  }

  if (aiProvider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': aiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error?.message || 'Anthropic error')
    return d.content[0].text
  }

  // Default: Gemini
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${aiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  )
  const d = await r.json()
  if (!r.ok) throw new Error(d.error?.message || 'Gemini error')
  return d.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// ── File → base64 helper ──────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Attachment object builder — compresses images first (see imageCompress.js;
// screenshots are often multi-MB and cross the network twice on send) so both
// the filename/mimeType and the base64 content always describe the same
// (possibly re-encoded) file. Non-image files pass through unchanged.
async function buildAttachment(file) {
  const f = await compressImageIfNeeded(file)
  return { filename: f.name, content: await fileToBase64(f), mimeType: f.type }
}

// ─────────────────────────────────────────────────────────
export default function EmailModal({
  isOpen = true,
  contactId,
  companyId,
  contactEmail,
  contactName,
  onClose,
  onSaved,
  onActivitySaved,
}) {
  const { dragRef, pos } = useDraggable()

  // Gmail status
  const [gmailStatus, setGmailStatus] = useState(null)
  const [mode,        setMode]        = useState('check')

  // Core compose fields
  const [toEmail,   setToEmail]   = useState(contactEmail || '')
  const [cc,        setCc]        = useState('')
  const [bcc,       setBcc]       = useState('')
  const [showCc,    setShowCc]    = useState(false)
  const [showBcc,   setShowBcc]   = useState(false)
  const [subject,   setSubject]   = useState('')
  const [body,      setBody]      = useState('')

  // Template
  const [template,    setTemplate]    = useState('manual')
  const [clientName,  setClientName]  = useState('')

  // Email Mode — controls thread continuation for this send only (Update 4).
  // 'continue' looks up the latest conversation by sender+recipient email
  // automatically; 'new' always sends a fresh, unthreaded conversation.
  const [emailMode, setEmailMode] = useState('continue')

  // Files
  const [beforeFile,       setBeforeFile]       = useState(null)
  const [afterFile,        setAfterFile]        = useState(null)
  const [additionalFiles,  setAdditionalFiles]  = useState([])
  const beforeInputRef    = useRef(null)
  const afterInputRef     = useRef(null)
  const additionalInputRef = useRef(null)

  // Preview
  const [showPreview,  setShowPreview]  = useState(false)
  const [previewHTML,  setPreviewHTML]  = useState('')
  const [generatingAI, setGeneratingAI] = useState(false)

  // AI settings (stored in localStorage)
  const [showAiSettings, setShowAiSettings] = useState(false)
  const [aiProvider, setAiProvider] = useState(
    () => localStorage.getItem('nxts_ai_provider') || 'gemini'
  )
  const [aiKey, setAiKey] = useState(
    () => localStorage.getItem('nxts_ai_key') || ''
  )

  // Log-manual mode
  const [emailStatus, setEmailStatus] = useState('sent')

  // State
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Pre-send deliverability report
  const [showReport, setShowReport] = useState(false)
  const [analyzing,  setAnalyzing]  = useState(false)
  const [report,     setReport]     = useState(null)

  // Verdana is the default font for every outgoing email (manual or
  // templated, including AI) unless the content already sets its own font.
  const wrapDefaultFont = (html) =>
    `<div style="font-family:Verdana,Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">${html}</div>`

  // Same HTML the send path uses, so the analysis/preview always matches what
  // actually goes out.
  const buildSendHtml = () => wrapDefaultFont(template === 'manual' ? body.replace(/\n/g, '<br>') : body)

  // Intercept Send → analyze first, then show the report. Send happens only if
  // the user chooses "Send" inside the report (which calls sendViaGmail unchanged).
  const reviewBeforeSend = async () => {
    if (!toEmail || !subject) { setError('To and Subject are required.'); return }
    setError('')
    setReport(null); setAnalyzing(true); setShowReport(true)
    const r = await runDeliverabilityAnalysis({
      subject,
      html: buildSendHtml(),
      fromEmail: gmailStatus?.email,
      aiProvider,
      aiKey,
    })
    setReport(r); setAnalyzing(false)
  }

  const applyAiSuggestion = ({ subject: s, html }) => {
    if (s) setSubject(s)
    if (html) { setTemplate('manual'); setBody(html.replace(/>\s+</g, '><').trim()) }
    setShowReport(false)
  }

  // ── Check Gmail on open ─────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    setToEmail(contactEmail || '')
    setTemplate('manual')
    setClientName('')
    setEmailMode('continue')
    setSubject('')
    setBody('')
    setCc(''); setBcc(''); setShowCc(false); setShowBcc(false)
    setBeforeFile(null); setAfterFile(null); setAdditionalFiles([])
    setShowPreview(false); setPreviewHTML(''); setError('')

    api.get('/email/status')
      .then(r => { setGmailStatus(r.data); setMode(r.data.connected ? 'compose' : 'connect') })
      .catch(() => { setGmailStatus({ connected: false }); setMode('connect') })
  }, [isOpen])

  // ── Auto-fill on template change ────────────────────────
  useEffect(() => {
    if (template === 'manual' || template === '3') return
    const { subject: s, html } = buildTemplateContent(template, clientName)
    setSubject(s)
    setBody(html)
    setPreviewHTML(html)
  }, [template, clientName])

  // ── Save AI settings to localStorage ───────────────────
  const saveAiSettings = () => {
    localStorage.setItem('nxts_ai_provider', aiProvider)
    localStorage.setItem('nxts_ai_key', aiKey)
    setShowAiSettings(false)
  }

  // ── Build preview ────────────────────────────────────────
  const buildPreview = async () => {
    if (template === '3') {
      if (!aiKey) { setShowAiSettings(true); setError('Please set your AI API key in settings first.'); return }
      setGeneratingAI(true); setError('')
      try {
        const html = await generateAiPdpAudit(clientName, aiProvider, aiKey)
        setBody(html)
        setPreviewHTML(wrapDefaultFont(html))
        if (!subject) setSubject(`AI PDP Audit – ${clientName || 'Your Store'}`)
      } catch (e) {
        setError(`AI generation failed: ${e.message}`)
      } finally {
        setGeneratingAI(false)
      }
    } else {
      setPreviewHTML(template === 'manual' && !body ? '' : buildSendHtml())
    }
    setShowPreview(true)
  }

  // ── Draft save/load ──────────────────────────────────────
  const saveDraft = () => {
    const drafts = JSON.parse(localStorage.getItem('nxts_email_drafts') || '[]')
    drafts.unshift({
      id: Date.now(),
      savedAt: new Date().toISOString(),
      template, clientName, to: toEmail, cc, bcc, subject, body, emailMode,
    })
    localStorage.setItem('nxts_email_drafts', JSON.stringify(drafts.slice(0, 50)))
    setError('Draft saved.')
    setTimeout(() => setError(''), 2000)
  }

  // ── Send via Gmail ───────────────────────────────────────
  const sendViaGmail = async () => {
    if (!toEmail || !subject) { setError('To and Subject are required.'); return }
    setSaving(true); setError('')
    try {
      const attachments = []
      const tplObj = TEMPLATES.find(t => t.value === template)

      if (tplObj?.needsBeforeAfter) {
        if (beforeFile) attachments.push(await buildAttachment(beforeFile))
        if (afterFile)  attachments.push(await buildAttachment(afterFile))
      }
      for (const f of additionalFiles) {
        attachments.push(await buildAttachment(f))
      }

      const htmlBody = buildSendHtml()

      const { data } = await api.post('/email/send', {
        to: toEmail,
        subject,
        htmlBody,
        cc:  cc  || undefined,
        bcc: bcc || undefined,
        attachments,
        emailMode,
        ...(contactId && { contactId }),
        ...(companyId && { companyId }),
      })

      // Save to sent folder in localStorage
      const sent = JSON.parse(localStorage.getItem('nxts_sent_emails') || '[]')
      sent.unshift({ id: data.id || Date.now(), sentAt: new Date().toISOString(), to: toEmail, subject, template })
      localStorage.setItem('nxts_sent_emails', JSON.stringify(sent.slice(0, 200)))

      if (onSaved)         onSaved(data)
      if (onActivitySaved) onActivitySaved(data)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to send email.')
    } finally {
      setSaving(false)
    }
  }

  // ── Gmail connect / disconnect ───────────────────────────
  const connectGmail = async () => {
    try {
      const { data } = await api.get('/email/gmail/auth-url')
      const popup = window.open(data.url, 'gmail-oauth', 'width=600,height=700,left=200,top=100')
      const handleMsg = (e) => {
        if (e.data === 'gmail_success') {
          window.removeEventListener('message', handleMsg)
          popup?.close()
          setGmailStatus({ connected: true })
          setMode('compose')
        }
        if (e.data === 'gmail_error') {
          window.removeEventListener('message', handleMsg)
          popup?.close()
          setError('Gmail connection failed. Check GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in server/.env')
        }
      }
      window.addEventListener('message', handleMsg)
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not start Gmail connection.')
    }
  }

  const disconnectGmail = async () => {
    await api.delete('/email/gmail/disconnect').catch(() => {})
    setGmailStatus({ connected: false })
    setMode('connect')
  }

  // ── Manual log ───────────────────────────────────────────
  const logManually = async () => {
    if (!toEmail || !subject) { setError('To and Subject are required.'); return }
    setSaving(true); setError('')
    try {
      const { data } = await api.post('/activities', {
        type: 'email',
        ...(contactId && { contactId }),
        ...(companyId && { companyId }),
        title: `Email – ${subject}`,
        body,
        toEmail,
        subject,
        emailStatus,
      })
      if (onSaved)         onSaved(data)
      if (onActivitySaved) onActivitySaved(data)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save email.')
    } finally {
      setSaving(false)
    }
  }

  const removeAdditionalFile = (idx) =>
    setAdditionalFiles(prev => prev.filter((_, i) => i !== idx))

  const tplObj = TEMPLATES.find(t => t.value === template)
  const needsBeforeAfter = tplObj?.needsBeforeAfter

  if (!isOpen) return null

  const modalWidth = showPreview && mode === 'compose' ? 1060 : 660

  return (
    <div className="act-popup-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className="act-popup"
        ref={dragRef}
        style={{ width: modalWidth, maxWidth: '96vw', transform: `translate(${pos.x}px, ${pos.y}px)`, transition: 'width 0.2s' }}
      >
        {/* ── Header ── */}
        <div className="act-popup-header">
          <div className="act-popup-title">
            <Mail size={15} /> Email{contactName ? ` — ${contactName}` : ''}
          </div>
          <div className="act-popup-header-actions">
            {gmailStatus?.connected && (
              <span style={{ fontSize: 11, color: '#10b981', marginRight: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle size={12} /> {gmailStatus.email}
              </span>
            )}
            <button className="act-popup-icon-btn" title="Save draft" onClick={saveDraft} style={{ marginRight: 2 }}>
              <span style={{ fontSize: 11 }}>Draft</span>
            </button>
            <button className="act-popup-icon-btn" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="act-popup-body" style={{
          display: showPreview && mode === 'compose' ? 'grid' : 'block',
          gridTemplateColumns: showPreview && mode === 'compose' ? '1fr 1fr' : undefined,
          gap: 16,
          padding: 16,
        }}>

          {/* ── Left: form ── */}
          <div>
            {/* Loading */}
            {mode === 'check' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10, color: '#94a3b8' }}>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Checking Gmail…
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}

            {/* Connect */}
            {mode === 'connect' && (
              <div className="connect-inbox-card">
                <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
                <h3>Keep track of your email activity in your CRM</h3>
                <p>Connect your Gmail account to send emails directly from NXT Sales.</p>
                <div className="connect-inbox-buttons">
                  <button className="connect-inbox-btn" onClick={connectGmail}>
                    <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Connect Gmail
                  </button>
                </div>
                <div className="connect-inbox-divider">or</div>
                <button className="btn-act-cancel" style={{ margin: '0 auto' }} onClick={() => setMode('log')}>
                  Log an email manually
                </button>
                {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 10, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={13} /> {error}</p>}
              </div>
            )}

            {/* Compose */}
            {mode === 'compose' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* From */}
                <div className="act-form-group">
                  <label>From</label>
                  <input type="text" value={gmailStatus?.email || 'Your Gmail'} disabled style={{ background: '#f8fafc', color: '#64748b' }} />
                </div>

                {/* Template selector */}
                <div className="act-form-group">
                  <label>Template</label>
                  <select value={template} onChange={e => setTemplate(e.target.value)} style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #cbd5e1', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}>
                    {TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                {/* Client name (required for templates) */}
                {template !== 'manual' && (
                  <div className="act-form-group">
                    <label>Client name *</label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      placeholder="e.g. John Smith"
                    />
                  </div>
                )}

                {/* AI Settings (for template 3) */}
                {template === '3' && (
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#0369a1' }}>AI Configuration (Template 3)</span>
                      <button
                        onClick={() => setShowAiSettings(v => !v)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0369a1', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <Settings2 size={13} /> {showAiSettings ? 'Hide' : 'Edit'}
                      </button>
                    </div>
                    {showAiSettings && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                        <div className="act-form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>AI Provider</label>
                          <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #cbd5e1', borderRadius: 5, fontSize: 12, fontFamily: 'inherit' }}>
                            <option value="gemini">Gemini (Google)</option>
                            <option value="openai">OpenAI (GPT)</option>
                            <option value="anthropic">Anthropic (Claude)</option>
                          </select>
                        </div>
                        <div className="act-form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>API Key</label>
                          <input type="password" value={aiKey} onChange={e => setAiKey(e.target.value)} placeholder="Paste your API key" style={{ fontSize: 12 }} />
                        </div>
                        <button onClick={saveAiSettings} style={{ padding: '5px 12px', background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, alignSelf: 'flex-end' }}>Save</button>
                      </div>
                    )}
                    {!showAiSettings && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#0369a1' }}>Click "Generate AI Body" button below to compose with AI.</p>}
                  </div>
                )}

                {/* To */}
                <div className="act-form-row">
                  <div className="act-form-group" style={{ flex: 1 }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                      To *
                      <span style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => setShowCc(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: showCc ? '#0f172a' : '#94a3b8', fontWeight: 500 }}>CC</button>
                        <button type="button" onClick={() => setShowBcc(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: showBcc ? '#0f172a' : '#94a3b8', fontWeight: 500 }}>BCC</button>
                      </span>
                    </label>
                    <input type="email" value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="recipient@example.com" />
                  </div>
                </div>

                {showCc && (
                  <div className="act-form-group">
                    <label>CC</label>
                    <input type="text" value={cc} onChange={e => setCc(e.target.value)} placeholder="cc@example.com, another@example.com" />
                  </div>
                )}

                {showBcc && (
                  <div className="act-form-group">
                    <label>BCC</label>
                    <input type="text" value={bcc} onChange={e => setBcc(e.target.value)} placeholder="bcc@example.com" />
                  </div>
                )}

                {/* Email Mode — controls thread continuation for this send only */}
                <div className="act-form-group">
                  <label>Email Mode</label>
                  <select value={emailMode} onChange={e => setEmailMode(e.target.value)}>
                    <option value="continue">Continue Existing Thread</option>
                    <option value="new">New Conversation</option>
                  </select>
                </div>

                {/* Subject */}
                <div className="act-form-group">
                  <label>Subject *</label>
                  <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject" />
                </div>

                {/* Body */}
                <div className="act-form-group">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Message
                    {template !== 'manual' && (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>Template auto-filled — edit freely</span>
                    )}
                  </label>
                  <textarea
                    rows={template === 'manual' ? 6 : 4}
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder={template === 'manual' ? 'Write your email…' : 'Template body (editable)…'}
                    style={{ fontSize: 13, lineHeight: 1.5 }}
                  />
                </div>

                {/* Before / After upload */}
                {needsBeforeAfter && (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Before &amp; After Screenshots</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Before screenshot</div>
                        <input ref={beforeInputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => setBeforeFile(e.target.files[0] || null)} />
                        <button type="button" onClick={() => beforeInputRef.current.click()} style={{ width: '100%', padding: '7px 10px', border: '1.5px dashed #cbd5e1', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: beforeFile ? '#0f172a' : '#94a3b8', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {beforeFile ? `✓ ${beforeFile.name}` : '+ Upload Before'}
                        </button>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>After screenshot</div>
                        <input ref={afterInputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => setAfterFile(e.target.files[0] || null)} />
                        <button type="button" onClick={() => afterInputRef.current.click()} style={{ width: '100%', padding: '7px 10px', border: '1.5px dashed #cbd5e1', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: afterFile ? '#0f172a' : '#94a3b8', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {afterFile ? `✓ ${afterFile.name}` : '+ Upload After'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional attachments */}
                <div>
                  <input ref={additionalInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => setAdditionalFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                  <button type="button" onClick={() => additionalInputRef.current.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1.5px dashed #cbd5e1', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', color: '#64748b', fontSize: 12 }}>
                    <Paperclip size={13} /> Add attachments
                  </button>
                  {additionalFiles.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {additionalFiles.map((f, i) => (
                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 8px', fontSize: 11, color: '#0f172a' }}>
                          {f.name}
                          <button type="button" onClick={() => removeAdditionalFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, lineHeight: 1 }}>
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {error && (
                  <p style={{ color: error === 'Draft saved.' ? '#10b981' : '#ef4444', fontSize: 12, margin: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {error !== 'Draft saved.' && <AlertCircle size={12} />} {error}
                  </p>
                )}
              </div>
            )}

            {/* Manual log */}
            {mode === 'log' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="act-form-row">
                  <div className="act-form-group">
                    <label>To *</label>
                    <input type="email" value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="recipient@example.com" autoFocus />
                  </div>
                  <div className="act-form-group" style={{ maxWidth: 160 }}>
                    <label>Status</label>
                    <select value={emailStatus} onChange={e => setEmailStatus(e.target.value)}>
                      <option value="sent">Sent</option>
                      <option value="delivered">Delivered</option>
                      <option value="opened">Opened</option>
                      <option value="replied">Replied</option>
                      <option value="received">Received</option>
                    </select>
                  </div>
                </div>
                <div className="act-form-group">
                  <label>Subject *</label>
                  <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject" />
                </div>
                <div className="act-form-group">
                  <label>Body</label>
                  <textarea rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="Email body…" />
                </div>
                {error && <p style={{ color: '#ef4444', fontSize: 12, margin: 0, fontWeight: 500 }}>{error}</p>}
              </div>
            )}
          </div>

          {/* ── Right: preview panel ── */}
          {showPreview && mode === 'compose' && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#0f172a', display: 'flex', justifyContent: 'space-between' }}>
                Preview
                <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={13} /></button>
              </div>
              {generatingAI ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#94a3b8', flexDirection: 'column', padding: 32 }}>
                  <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 13 }}>AI is composing your PDP Audit email…</span>
                </div>
              ) : (
                <div
                  style={{ flex: 1, overflowY: 'auto', padding: 16, fontSize: 13, lineHeight: 1.7, color: '#0f172a' }}
                  dangerouslySetInnerHTML={{ __html: previewHTML || '<span style="color:#94a3b8">No preview yet. Fill in the form and click Preview.</span>' }}
                />
              )}
              {/* Attachments in preview */}
              {(beforeFile || afterFile || additionalFiles.length > 0) && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Attachments:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {beforeFile && <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 4 }}>{beforeFile.name}</span>}
                    {afterFile  && <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 4 }}>{afterFile.name}</span>}
                    {additionalFiles.map((f, i) => <span key={i} style={{ fontSize: 11, background: '#f1f5f9', color: '#0f172a', padding: '2px 8px', borderRadius: 4 }}>{f.name}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {mode === 'compose' && (
          <div className="act-popup-footer">
            <div className="act-popup-footer-left">
              <button className="btn-act-cancel" style={{ fontSize: 11, color: '#94a3b8' }} onClick={disconnectGmail}>
                Disconnect Gmail
              </button>
            </div>
            <div className="act-popup-footer-right">
              {template === '3' ? (
                <button className="btn-act-cancel" onClick={buildPreview} disabled={generatingAI} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={13} /> {generatingAI ? 'Generating…' : 'Generate AI Body'}
                </button>
              ) : (
                <button className="btn-act-cancel" onClick={buildPreview} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {showPreview ? <EyeOff size={13} /> : <Eye size={13} />} {showPreview ? 'Hide Preview' : 'Preview'}
                </button>
              )}
              <button className="btn-act-cancel" onClick={onClose}>Cancel</button>
              <button className="btn-act-save" onClick={reviewBeforeSend} disabled={saving || analyzing}>
                <Send size={13} /> {saving ? 'Sending…' : analyzing ? 'Analyzing…' : 'Review & Send'}
              </button>
            </div>
          </div>
        )}

        <DeliverabilityReport
          open={showReport}
          analyzing={analyzing}
          report={report}
          currentSubject={subject}
          sending={saving}
          onClose={() => setShowReport(false)}
          onApplyAI={applyAiSuggestion}
          onSend={sendViaGmail}
        />

        {mode === 'log' && (
          <div className="act-popup-footer">
            <div className="act-popup-footer-left">
              <button className="btn-act-cancel" onClick={() => setMode('connect')}>← Back</button>
            </div>
            <div className="act-popup-footer-right">
              <button className="btn-act-cancel" onClick={onClose}>Cancel</button>
              <button className="btn-act-save" onClick={logManually} disabled={saving}>
                <Mail size={13} /> {saving ? 'Saving…' : 'Log email'}
              </button>
            </div>
          </div>
        )}

        {(mode === 'connect' || mode === 'check') && (
          <div className="act-popup-footer">
            <div className="act-popup-footer-right" style={{ marginLeft: 'auto' }}>
              <button className="btn-act-cancel" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
