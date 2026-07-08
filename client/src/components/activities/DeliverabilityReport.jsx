// Pre-send deliverability / spam report modal (shared by EmailModal and EmailTool).
// Purely presentational + user decision. It never sends by itself — the parent's
// existing send function runs only if the user clicks "Send anyway".
import { useState } from 'react'

const RISK_COLOR = { Low: '#16a34a', Medium: '#d97706', High: '#dc2626' }
const SEV = {
  pass: { icon: '✓', color: '#16a34a', bg: '#f0fdf4' },
  warn: { icon: '!', color: '#d97706', bg: '#fffbeb' },
  fail: { icon: '✕', color: '#dc2626', bg: '#fef2f2' },
  info: { icon: 'i', color: '#0369a1', bg: '#f0f9ff' },
}

function Gauge({ value, label, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 120 }}>
      <div style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1 }}>{value}%</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
    </div>
  )
}

function AuthRow({ name, ok, detail }) {
  const s = ok ? SEV.pass : SEV.warn
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: s.bg, color: s.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{ok ? '✓' : '—'}</span>
      <strong style={{ fontSize: 12.5, width: 58 }}>{name}</strong>
      <span style={{ fontSize: 12, color: '#475569' }}>{ok ? (detail || 'Found') : 'Not detected'}</span>
    </div>
  )
}

export default function DeliverabilityReport({ open, analyzing, report, currentSubject, onClose, onSend, onApplyAI, sending }) {
  const [applied, setApplied] = useState(false)
  if (!open) return null

  const content = report?.content
  const ai = report?.ai
  const auth = report?.auth
  const inbox = report?.inboxProbability ?? content?.inboxProbability ?? 0
  const risk = content?.spamRisk || 'Medium'

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 4000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  }
  const card = {
    background: '#fff', borderRadius: 12, width: 'min(680px, 100%)', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    fontFamily: 'DM Sans, system-ui, sans-serif',
  }
  const sectionTitle = { fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5, margin: '18px 0 8px' }

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget && !sending) onClose() }}>
      <div style={card}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>📬 Deliverability Report</div>
            <div style={{ fontSize: 11.5, color: '#94a3b8' }}>Pre-send quality check · guidance only, not a guarantee</div>
          </div>
          <button onClick={onClose} disabled={sending} style={{ border: 'none', background: 'none', fontSize: 20, color: '#94a3b8', cursor: sending ? 'default' : 'pointer' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '4px 20px 8px', overflowY: 'auto' }}>
          {analyzing ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>
              <div style={{ width: 30, height: 30, border: '3px solid #e2e8f0', borderTopColor: '#0369a1', borderRadius: '50%', margin: '0 auto 14px', animation: 'dlspin 0.8s linear infinite' }} />
              <style>{`@keyframes dlspin{to{transform:rotate(360deg)}}`}</style>
              Analyzing content, formatting & authentication…
            </div>
          ) : (
            <>
              {/* Scores */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '18px 0 6px' }}>
                <Gauge value={inbox} label="Inbox probability" color={inbox >= 70 ? '#16a34a' : inbox >= 45 ? '#d97706' : '#dc2626'} />
                <div style={{ width: 1, height: 46, background: '#e2e8f0' }} />
                <div style={{ textAlign: 'center', minWidth: 120 }}>
                  <span style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 20, fontWeight: 700, fontSize: 15, color: '#fff', background: RISK_COLOR[risk] }}>{risk}</span>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Spam risk</div>
                </div>
              </div>
              {content?.stats && (
                <div style={{ textAlign: 'center', fontSize: 11.5, color: '#94a3b8', marginBottom: 4 }}>
                  {content.stats.words} words · {content.stats.links} links · {content.stats.images} images · {content.stats.keywords} trigger words · {content.stats.capsPct}% caps
                </div>
              )}

              {/* Content checks */}
              <div style={sectionTitle}>Content &amp; formatting</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {content?.checks?.map((c, i) => {
                  const s = SEV[c.severity] || SEV.info
                  return (
                    <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '6px 8px', borderRadius: 7, background: s.bg }}>
                      <span style={{ width: 17, height: 17, borderRadius: '50%', background: s.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
                      <div style={{ fontSize: 12.5 }}>
                        <strong style={{ color: '#0f172a' }}>{c.label}</strong>
                        <span style={{ color: '#475569' }}> — {c.detail}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Authentication */}
              <div style={sectionTitle}>Authentication (SPF · DKIM · DMARC)</div>
              {auth?.available ? (
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 4 }}>Sending domain: <strong>{auth.domain}</strong> {auth.isFreeDomain && <span style={{ color: '#d97706' }}>(free mailbox provider)</span>}</div>
                  <AuthRow name="SPF"   ok={auth.spf?.found} />
                  <AuthRow name="DKIM"  ok={auth.dkim?.found} detail={auth.dkim?.found ? `selector: ${auth.dkim.selector}` : ''} />
                  <AuthRow name="DMARC" ok={auth.dmarc?.found} detail={auth.dmarc?.found ? `policy: p=${auth.dmarc.policy}` : ''} />
                  <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 5 }}>Best-effort DNS lookup. DKIM selectors are private, so “not detected” may still be signed by your provider.</div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{auth?.message || 'Authentication check unavailable.'}</div>
              )}

              {/* Reputation / recommendations */}
              {auth?.recommendations?.length > 0 && (
                <>
                  <div style={sectionTitle}>Sender reputation &amp; recommendations</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {auth.recommendations.map((r, i) => {
                      const s = SEV[r.level] || SEV.info
                      return (
                        <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#334155' }}>
                          <span style={{ color: s.color, fontWeight: 700 }}>•</span>{r.text}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* AI suggestions */}
              <div style={sectionTitle}>AI review &amp; rewrite</div>
              {ai?.available ? (
                <div style={{ background: '#f0f9ff', border: '1px solid #e0f2fe', borderRadius: 8, padding: '10px 12px' }}>
                  {ai.issues?.length > 0 && (
                    <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 12.5, color: '#334155' }}>
                      {ai.issues.map((it, i) => <li key={i} style={{ marginBottom: 2 }}>{it}</li>)}
                    </ul>
                  )}
                  {ai.improvedSubject && (
                    <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>
                      <strong>Suggested subject:</strong> {ai.improvedSubject}
                    </div>
                  )}
                  {(ai.improvedBody || ai.improvedSubject) && (
                    <button
                      onClick={() => { onApplyAI?.({ subject: ai.improvedSubject, html: ai.improvedBody }); setApplied(true) }}
                      disabled={applied}
                      style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', cursor: applied ? 'default' : 'pointer', background: applied ? '#cbd5e1' : '#0369a1', color: '#fff' }}
                    >
                      {applied ? '✓ Applied — re-run to re-check' : 'Apply AI-improved version'}
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {ai?.error ? `AI review skipped: ${ai.error}` : 'Add an AI key in the composer’s AI settings to enable AI scoring and rewrite suggestions.'}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>You decide — review, edit, or send.</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={sending} style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: sending ? 'default' : 'pointer' }}>Back to edit</button>
            <button onClick={onSend} disabled={analyzing || sending} style={{ padding: '9px 18px', fontSize: 13, fontWeight: 700, borderRadius: 7, border: 'none', background: (analyzing || sending) ? '#94a3b8' : (risk === 'High' ? '#dc2626' : '#0f172a'), color: '#fff', cursor: (analyzing || sending) ? 'default' : 'pointer' }}>
              {sending ? 'Sending…' : risk === 'High' ? 'Send anyway' : 'Looks good — Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
