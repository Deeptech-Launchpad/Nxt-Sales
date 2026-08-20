import { useNavigate } from 'react-router-dom'
import { BarChart3, ArrowRight } from 'lucide-react'

// Compact link card shown in Email Tool → Settings.
//
// The full analytics (tokens, cost, charts, per-feature/per-model breakdowns)
// now live on the dedicated Marketing → AI Usage dashboard (pages/AiUsage.jsx),
// so Settings stays focused on configuration. This component deliberately
// renders no data — it is purely navigation.
//
// Colours use the Email Tool's own dark-theme tokens (--et-*) because this
// renders inside .et-root; hardcoded light-theme values would be unreadable
// here, which is exactly what went wrong with the previous inline panel.
export default function AiUsagePanel() {
  const navigate = useNavigate()

  return (
    <div className="et-settings-card">
      <div className="et-settings-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <BarChart3 size={15} color="#2DD4BF" />
        AI Usage &amp; Token Consumption
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <p style={{ flex: 1, minWidth: 220, fontSize: 13, lineHeight: 1.55, color: 'var(--et-txt-s)', margin: 0 }}>
          Token consumption and estimated cost across every AI feature — Email AI, Deliverability and
          Customer Intelligence — with charts and per-feature breakdowns.
        </p>
        <button
          className="et-btn et-btn-primary"
          style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 190 }}
          onClick={() => navigate('/ai-usage')}
        >
          View AI Usage Dashboard <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
