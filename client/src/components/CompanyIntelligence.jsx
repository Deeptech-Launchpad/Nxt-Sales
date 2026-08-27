import { useState } from 'react'
import { Sparkles, RefreshCw, Loader2, AlertCircle, Globe, Mail, Copy, Check } from 'lucide-react'
import { generateCompanyInsights, getCachedInsights, getAiSettings } from '../utils/companyIntelligence'

// AI Customer Intelligence section for the Company detail page (Intelligence
// tab). Gemini is only ever called from the explicit Generate/Refresh button
// — never automatically on page load — and the result is cached per company
// for the session (see utils/companyIntelligence.js). The API key itself is
// read from the shared Email Tool settings and never displayed here.
//
// The model returns a "Sales Pitch Intelligence Sheet" as readable text, not
// JSON. This component renders that text as the sheet: it recognises the
// prompt's own numbered section headers and its four provenance labels
// ([CRM data] / [Page data] / [Email summary] / [AI inference]) and styles
// them, without rewriting or reordering anything the model produced.

// The prompt separates sections with a line of dashes and a NUMBERED heading:
//   ------------------------------------------------
//   1. COMPANY SNAPSHOT & ORIGIN
//   ------------------------------------------------
// Matching that shape (rather than a fixed list of titles) means the renderer
// keeps working if a heading is ever reworded in the prompt.
const RULE_LINE = /^\s*-{5,}\s*$/
const NUMBERED_LINE = /^\s*(\d+)\.\s+(.{3,90}?)\s*$/
const BARE_HEADING = /^\s*(OUTPUT RULES:|TASK:|ROLE:|INPUTS PROVIDED TO YOU:)\s*$/

// A numbered line is a section heading only if it READS like one. Testing for
// "no lowercase anywhere" is too strict — the prompt's own section 5 is
// "5. RELATIONSHIP CONTEXT (from synced email)", whose parenthetical is
// lowercase, and requiring all-caps silently swallowed that whole section into
// the previous one. So: drop parenthetical clauses, then require what's left
// to be overwhelmingly uppercase. That keeps real headings while never
// mistaking an ordinary numbered sentence for one.
function looksLikeHeading(text) {
  const core = text.replace(/\([^)]*\)/g, '').trim()
  const letters = core.replace(/[^A-Za-z]/g, '')
  if (letters.length < 3) return false
  const upper = core.replace(/[^A-Z]/g, '').length
  return upper / letters.length >= 0.8
}

const LABEL_STYLES = {
  '[CRM data]':      { color: '#0d9488', background: '#f0fdfa', border: '1px solid #99f6e4' },
  '[Page data]':     { color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe' },
  '[Email summary]': { color: '#c2410c', background: '#fff7ed', border: '1px solid #fed7aa' },
  '[AI inference]':  { color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe' },
}
const LABEL_RE = /(\[CRM data\]|\[Page data\]|\[Email summary\]|\[AI inference\])/g

// The role blocks use these as inline field prefixes — bolding them makes the
// sheet scannable on a live call, which is the whole point of the format.
const FIELD_RE = /^(Icebreaker|The Hook|Value Pitch|Discovery Question|Angle|Discovery Q|Sentiment read|Last contact date and channel)\s*:/i

function fmtGeneratedAt(iso) {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Splits the sheet into { heading, lines } blocks. Anything before the first
// heading is kept in a leading untitled block so no model output is dropped.
function parseSheet(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let current = { heading: null, lines: [] }

  for (let i = 0; i < raw.length; i++) {
    const l = raw[i]
    if (RULE_LINE.test(l)) continue           // the prompt's divider rules
    const n = l.match(NUMBERED_LINE)
    const numbered = n && looksLikeHeading(n[2]) ? n : null
    const bare = l.match(BARE_HEADING)
    if (numbered || bare) {
      if (current.heading || current.lines.some(x => x.trim())) blocks.push(current)
      current = { heading: (numbered ? `${numbered[1]}. ${numbered[2]}` : bare[1]).trim(), lines: [] }
      continue
    }
    current.lines.push(l)
  }
  if (current.heading || current.lines.some(x => x.trim())) blocks.push(current)
  return blocks
}

// Renders one line, turning provenance labels into badges and bolding the
// role-block field prefixes. Plain text otherwise — never reflowed.
function renderLine(line, key) {
  const trimmed = line.trim()
  if (!trimmed) return <div key={key} style={{ height: 7 }} />

  const indent = (line.match(/^\s*/)?.[0].length || 0)
  const bullet = /^\s*[-•*]\s+/.test(line)
  const body = bullet ? trimmed.replace(/^[-•*]\s+/, '') : trimmed

  const fieldMatch = body.match(FIELD_RE)
  const afterField = fieldMatch ? body.slice(fieldMatch[0].length) : body

  const pieces = afterField.split(LABEL_RE).filter(s => s !== '')

  return (
    <div
      key={key}
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 5,
        padding: '1.5px 0', paddingLeft: Math.min(indent, 8) * 2 + (bullet ? 10 : 0),
        fontSize: 16, color: '#0f172a', lineHeight: 1.55,
      }}
    >
      {bullet && <span style={{ color: '#475467', marginLeft: -10 }}>•</span>}
      {fieldMatch && <strong style={{ color: '#334155' }}>{fieldMatch[0]}</strong>}
      {pieces.map((p, i) => {
        const style = LABEL_STYLES[p]
        if (style) {
          return (
            <span key={i} style={{ ...style, fontSize: 12, fontWeight: 700, borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}>
              {p.slice(1, -1)}
            </span>
          )
        }
        return <span key={i}>{p}</span>
      })}
    </div>
  )
}

export default function CompanyIntelligence({ company }) {
  const [result,  setResult]  = useState(() => getCachedInsights(company.id))
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [copied,  setCopied]  = useState(false)

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

  // The sheet is meant to be read on a live call — copying it into a notes
  // app or a dialer is a normal thing to want.
  const copySheet = async () => {
    try {
      await navigator.clipboard.writeText(result.sheet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked (insecure context / permission) — silently ignore
      // rather than throwing an error over a convenience action.
    }
  }

  const blocks = result ? parseSheet(result.sheet) : []
  const src = result?.sources

  return (
    <div className="detail-section" style={{ marginBottom: 20 }}>
      <div className="detail-section-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Sparkles size={14} color="#7c3aed" />
        Customer Intelligence (AI)
        {result && (
          <button
            onClick={copySheet}
            title="Copy the full sheet"
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
              background: '#fff', color: '#475569', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {copied ? <><Check size={12} color="#0d9488" /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        )}
        <button
          onClick={generate}
          disabled={loading || !hasKey}
          title={hasKey ? undefined : 'Add your Gemini API key in Marketing → Email → Settings first'}
          style={{
            marginLeft: result ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 6, border: 'none', fontFamily: 'inherit',
            background: loading || !hasKey ? '#e2e8f0' : '#7c3aed',
            color: loading || !hasKey ? '#94a3b8' : '#fff',
            fontSize: 15, fontWeight: 600, cursor: loading || !hasKey ? 'not-allowed' : 'pointer',
          }}
        >
          {loading
            ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
            : result
              ? <><RefreshCw size={12} /> Refresh Sheet</>
              : <><Sparkles size={12} /> Generate Intelligence Sheet</>}
        </button>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {!hasKey && (
          <div style={{ fontSize: 15.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '9px 12px' }}>
            No AI API key configured. Add your Gemini API key once in <strong>Marketing → Email → Settings → AI API Key</strong> — this section reuses that same configuration.
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 15.5, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '9px 12px', marginBottom: result ? 12 : 0 }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div style={{ fontSize: 15.5, color: '#344054', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            Reading the prospect's site and synced email, then building the sheet…
          </div>
        )}

        {hasKey && !result && !error && !loading && (
          <div style={{ fontSize: 15.5, color: '#344054' }}>
            Build a one-page <strong>Sales Pitch Intelligence Sheet</strong> for this company — company snapshot,
            detected CMS/platform, enrichment opportunities, customer benefits, relationship context from synced
            email, and role-based call talking points. Reads in under a minute before you dial.
          </div>
        )}

        {result && (
          <>
            {/* Which inputs actually reached the model. Without this, an empty
                Relationship Context section is ambiguous — the rep can't tell
                "no synced email" from "the AI skipped it". */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <span
                title={src?.pageFetched ? src.pageUrl : (src?.pageReason || 'Page not fetched')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 600,
                  borderRadius: 5, padding: '3px 8px',
                  color: src?.pageFetched ? '#1d4ed8' : '#94a3b8',
                  background: src?.pageFetched ? '#eff6ff' : '#f8fafc',
                  border: `1px solid ${src?.pageFetched ? '#bfdbfe' : '#e2e8f0'}`,
                }}
              >
                <Globe size={11} />
                {src?.pageFetched ? 'Live page read' : 'No page data'}
              </span>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 600,
                  borderRadius: 5, padding: '3px 8px',
                  color: src?.emailThreads ? '#c2410c' : '#94a3b8',
                  background: src?.emailThreads ? '#fff7ed' : '#f8fafc',
                  border: `1px solid ${src?.emailThreads ? '#fed7aa' : '#e2e8f0'}`,
                }}
              >
                <Mail size={11} />
                {src?.emailThreads
                  ? `${src.emailMessages} email${src.emailMessages === 1 ? '' : 's'} · ${src.emailThreads} thread${src.emailThreads === 1 ? '' : 's'}`
                  : 'No synced email'}
              </span>
            </div>

            <div style={{ border: '1px solid #eef1f5', borderRadius: 9, overflow: 'hidden' }}>
              {blocks.map((b, bi) => (
                <div key={bi} style={{ borderTop: bi === 0 ? 'none' : '1px solid #f1f5f9' }}>
                  {b.heading && (
                    <div style={{
                      fontSize: 14.5, fontWeight: 700, color: '#334155', letterSpacing: '.4px',
                      textTransform: 'uppercase', padding: '8px 13px', background: '#f8fafc',
                      borderBottom: '1px solid #f1f5f9',
                    }}>
                      {b.heading}
                    </div>
                  )}
                  <div style={{ padding: '9px 13px' }}>
                    {b.lines.map((l, li) => renderLine(l, li))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 14, color: '#475467', borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 10 }}>
              Generated {fmtGeneratedAt(result.generatedAt)} ({result.model}) from CRM data
              {src?.pageFetched ? `, a live read of ${src.pageUrl}` : ''}
              {src?.emailThreads ? ', and synced Gmail history' : ''}.
              Items marked <strong>AI inference</strong> are the model's reasoning, not verified facts — review before contacting the customer.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
