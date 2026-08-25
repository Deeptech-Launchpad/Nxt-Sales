import { useState } from 'react'
import { Sparkles, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import { generateCompanyInsights, getCachedInsights, getAiSettings } from '../utils/companyIntelligence'

// AI Customer Intelligence section for the Company detail page (Intelligence
// tab). Gemini is only ever called from the explicit Generate/Refresh button
// — never automatically on page load — and the result is cached per company
// for the session (see utils/companyIntelligence.js). The API key itself is
// read from the shared Email Tool settings and never displayed here.

const SECTIONS = [
  { key: 'companyOverview',         title: 'Company Overview' },
  { key: 'contactOverview',         title: 'Contact Overview' },
  { key: 'potentialBusinessNeeds',  title: 'Potential Business Needs' },
  { key: 'potentialOpportunities',  title: 'Potential Opportunities' },
  { key: 'recommendedApproach',     title: 'Recommended Communication Approach' },
  { key: 'talkingPoints',           title: 'Call / Email Talking Points' },
]

const BADGE = {
  fact: {
    label: 'CRM data',
    style: { fontSize: 9, fontWeight: 700, color: '#0d9488', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 3, padding: '1px 5px', flexShrink: 0 },
  },
  inference: {
    label: 'AI inference',
    style: { fontSize: 9, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 3, padding: '1px 5px', flexShrink: 0 },
  },
}

function fmtGeneratedAt(iso) {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function CompanyIntelligence({ company }) {
  const [result,  setResult]  = useState(() => getCachedInsights(company.id))
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const hasKey = !!getAiSettings().key

  const generate = async () => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const r = await generateCompanyInsights(company)
      setResult(r)
    } catch (err) {
      setError(err.message || 'Could not generate insights.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="detail-section" style={{ marginBottom: 20 }}>
      <div className="detail-section-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Sparkles size={14} color="#7c3aed" />
        Customer Intelligence (AI)
        <button
          onClick={generate}
          disabled={loading || !hasKey}
          title={hasKey ? undefined : 'Add your Gemini API key in Marketing → Email → Settings first'}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 6, border: 'none', fontFamily: 'inherit',
            background: loading || !hasKey ? '#e2e8f0' : '#7c3aed',
            color: loading || !hasKey ? '#94a3b8' : '#fff',
            fontSize: 12, fontWeight: 600, cursor: loading || !hasKey ? 'not-allowed' : 'pointer',
          }}
        >
          {loading
            ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
            : result
              ? <><RefreshCw size={12} /> Refresh Insights</>
              : <><Sparkles size={12} /> Generate AI Insights</>}
        </button>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {!hasKey && (
          <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '9px 12px' }}>
            No AI API key configured. Add your Gemini API key once in <strong>Marketing → Email → Settings → AI API Key</strong> — this section reuses that same configuration.
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '9px 12px', marginBottom: result ? 12 : 0 }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {hasKey && !result && !error && !loading && (
          <div style={{ fontSize: 12.5, color: '#64748b' }}>
            Generate AI-powered insights from this company's stored CRM data — who they are, what they may need,
            and how to approach them — before making a call or sending an email.
          </div>
        )}

        {result && (
          <>
            {SECTIONS.map(({ key, title }) => {
              const items = result.insights[key] || []
              return (
                <div key={key} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>
                    {title}
                  </div>
                  {items.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Not available.</div>
                  ) : items.map((it, i) => {
                    const badge = BADGE[it.basis] || BADGE.inference
                    return (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', fontSize: 13, color: '#0f172a', lineHeight: 1.5 }}>
                        <span style={{ ...badge.style, marginTop: 3 }}>{badge.label}</span>
                        <span>{it.text}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            <div style={{ fontSize: 11, color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 4 }}>
              AI-generated from stored CRM data on {fmtGeneratedAt(result.generatedAt)} ({result.model}).
              Items marked <strong>AI inference</strong> are the model's reasoning, not verified facts — review before contacting the customer.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
