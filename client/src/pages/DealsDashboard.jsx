import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, Briefcase, Building2, Check, ChevronRight,
  FileCheck2, Layers, Sparkles, Target, TrendingUp, Trophy, X, Zap,
} from 'lucide-react'
import api from '../api/client'
import { formatCurrency } from '../utils/formatCurrency'
import '../styles/deals-dashboard.css'

const STAGE_COLORS = ['#3267e3', '#7c5ce5', '#ef9a2d', '#e4544e', '#21a875', '#18a1b8']

const stageTone = stage => {
  const value = String(stage || '').toLowerCase()
  if (value === 'won') return 'won'
  if (value === 'lost') return 'lost'
  if (value.includes('qualif')) return 'qualified'
  return 'active'
}

const shortDate = value => value
  ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : 'No date'

function MetricSkeleton() {
  return <span className="dd-skeleton" aria-label="Loading" />
}

export default function DealsDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    api.get('/dashboard/deal-stats')
      .then(response => { if (alive) setStats(response.data) })
      .catch(err => { if (alive) setError(err?.response?.data?.message || 'Could not load deal statistics.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const outcomes = (stats?.wonDeals || 0) + (stats?.lostDeals || 0)
  const winRate = outcomes ? Math.round(((stats?.wonDeals || 0) / outcomes) * 100) : 0
  const activeShare = stats?.totalDeals ? Math.round(((stats?.activeDeals || 0) / stats.totalDeals) * 100) : 0
  const companyCoverage = stats?.totalDeals
    ? Math.round(((stats.totalDeals - (stats?.dealsWithoutCompany || 0)) / stats.totalDeals) * 100)
    : 0
  const maxStage = Math.max(1, ...(stats?.stageBreakdown || []).map(item => item.count))

  const stageRows = useMemo(() => (stats?.stageBreakdown || []).map((item, index) => ({
    ...item,
    color: STAGE_COLORS[index % STAGE_COLORS.length],
    share: stats?.totalDeals ? Math.round((item.count / stats.totalDeals) * 100) : 0,
  })), [stats])

  const metrics = [
    { label: 'Active pipeline', value: stats?.activeDeals, meta: `${activeShare}% of all deals`, Icon: Zap, tone: 'blue', to: '/deals?focus=active' },
    { label: 'Deals won', value: stats?.wonDeals, meta: `${winRate}% close rate`, Icon: Trophy, tone: 'green', to: '/deals?focus=won' },
    { label: 'Deals lost', value: stats?.lostDeals, meta: `${outcomes ? 100 - winRate : 0}% of outcomes`, Icon: X, tone: 'red', to: '/deals?focus=lost' },
    { label: 'Total deals', value: stats?.totalDeals, meta: 'Across every stage', Icon: Layers, tone: 'violet', to: '/deals' },
  ]

  const openDeal = deal => {
    if (deal.company?.id) navigate(`/companies/${deal.company.id}`)
    else navigate('/deals')
  }

  return (
    <main className="dd-page">
      <section className="dd-hero dd-reveal">
        <div className="dd-hero-glow" aria-hidden="true" />
        <div className="dd-hero-copy">
          <span className="dd-eyebrow"><Sparkles size={13} /> Sales performance</span>
          <h1>Deals command center</h1>
          <p>See pipeline momentum, conversion health and the deals that need your attention.</p>
        </div>
        <button className="dd-hero-action" type="button" onClick={() => navigate('/deals')}>
          View deal pipeline <ArrowRight size={16} />
        </button>
        <div className="dd-hero-value">
          <span>Total pipeline value</span>
          <strong>{loading ? <MetricSkeleton /> : formatCurrency(stats?.totalValue || 0, 'USD')}</strong>
          <small><TrendingUp size={13} /> Value across {stats?.totalDeals || 0} deals</small>
        </div>
      </section>

      {error && <div className="dd-error" role="alert">{error}</div>}

      <section className="dd-metrics dd-reveal dd-delay-1" aria-label="Deal highlights">
        {metrics.map(({ label, value, meta, Icon, tone, to }) => (
          <button className={`dd-metric dd-metric--${tone}`} type="button" key={label} onClick={() => navigate(to)}>
            <span className="dd-metric-icon"><Icon size={19} /></span>
            <span className="dd-metric-copy">
              <span>{label}</span>
              <strong>{loading ? <MetricSkeleton /> : (value ?? 0)}</strong>
              <small>{meta}</small>
            </span>
            <ChevronRight className="dd-metric-arrow" size={17} />
          </button>
        ))}
      </section>

      <section className="dd-workspace dd-reveal dd-delay-2">
        <article className="dd-card dd-stage-card">
          <header className="dd-card-head">
            <div>
              <span className="dd-section-kicker">Pipeline distribution</span>
              <h2>Deals by stage</h2>
              <p>Understand where deals are gathering momentum.</p>
            </div>
            <button type="button" className="dd-text-action" onClick={() => navigate('/deals')}>Explore all <ArrowRight size={14} /></button>
          </header>

          <div className="dd-stage-list">
            {loading ? [1, 2, 3, 4].map(item => <div className="dd-stage-placeholder" key={item} />) : stageRows.length ? stageRows.map((item, index) => (
              <button className="dd-stage-row" type="button" key={item.stage} onClick={() => navigate('/deals')}>
                <span className="dd-stage-order">{String(index + 1).padStart(2, '0')}</span>
                <span className="dd-stage-main">
                  <span className="dd-stage-label"><strong>{item.stage}</strong><em>{item.share}% of pipeline</em></span>
                  <span className="dd-stage-track"><i style={{ width: `${Math.max(4, (item.count / maxStage) * 100)}%`, background: item.color }} /></span>
                </span>
                <span className="dd-stage-count">{item.count}</span>
              </button>
            )) : <div className="dd-empty">No deals have been added yet.</div>}
          </div>
        </article>

        <aside className="dd-card dd-health-card">
          <header className="dd-card-head">
            <div>
              <span className="dd-section-kicker">Conversion snapshot</span>
              <h2>Pipeline health</h2>
              <p>Closed deal performance at a glance.</p>
            </div>
          </header>

          <div className="dd-health-visual">
            <div className="dd-health-ring" style={{ '--dd-progress': `${winRate * 3.6}deg` }}>
              <div><strong>{loading ? '—' : `${winRate}%`}</strong><span>win rate</span></div>
            </div>
          </div>

          <div className="dd-health-stats">
            <button type="button" onClick={() => navigate('/deals?focus=won')}>
              <span className="dd-health-icon dd-health-icon--won"><Check size={15} /></span>
              <span><small>Won</small><strong>{loading ? '—' : stats?.wonDeals || 0}</strong></span>
            </button>
            <button type="button" onClick={() => navigate('/deals?focus=lost')}>
              <span className="dd-health-icon dd-health-icon--lost"><X size={15} /></span>
              <span><small>Lost</small><strong>{loading ? '—' : stats?.lostDeals || 0}</strong></span>
            </button>
          </div>

          <div className="dd-progress-metrics">
            <button type="button" onClick={() => navigate('/deals?focus=poc')}>
              <span><Target size={15} /> POC initiated</span><strong>{loading ? '—' : stats?.pocDeals || 0}</strong>
            </button>
            <button type="button" onClick={() => navigate('/deals?focus=proposal')}>
              <span><FileCheck2 size={15} /> Proposals shared</span><strong>{loading ? '—' : stats?.proposalSharedDeals || 0}</strong>
            </button>
          </div>
        </aside>
      </section>

      <section className="dd-bottom-grid dd-reveal dd-delay-3">
        <article className="dd-card dd-recent-card">
          <header className="dd-card-head">
            <div>
              <span className="dd-section-kicker">Latest activity</span>
              <h2>Recent deals</h2>
              <p>Your newest opportunities, ready to review.</p>
            </div>
            <button type="button" className="dd-text-action" onClick={() => navigate('/deals')}>View all <ArrowRight size={14} /></button>
          </header>

          <div className="dd-deal-table">
            <div className="dd-table-head"><span>Deal</span><span>Stage</span><span>Value</span><span>Open date</span><span /></div>
            {loading ? [1, 2, 3, 4].map(item => <div className="dd-deal-placeholder" key={item} />) : (stats?.recent || []).length ? stats.recent.map(deal => (
              <button className="dd-deal-row" type="button" key={deal.id} onClick={() => openDeal(deal)}>
                <span className="dd-deal-name">
                  <i><Briefcase size={16} /></i>
                  <span><strong>{deal.title}</strong><small>{deal.company?.name || 'No company linked'}</small></span>
                </span>
                <span><em className={`dd-stage-badge dd-stage-badge--${stageTone(deal.stage)}`}>{deal.stage || 'No stage'}</em></span>
                <strong className="dd-deal-value">{deal.value ? formatCurrency(deal.value, deal.currency || 'USD') : '—'}</strong>
                {/* Deal Open Date only. This used to fall back to createdAt under a
                    "Created" heading, so a deal with no Open Date still displayed a
                    date — and then vanished from a filter on that very date, because
                    the filter reads the real Open Date. Showing nothing is honest, and
                    it agrees with the filter. */}
                <span className="dd-deal-date">{deal.openDate ? shortDate(deal.openDate) : '—'}</span>
                <ChevronRight className="dd-row-arrow" size={17} />
              </button>
            )) : <div className="dd-empty">No recent deals to show.</div>}
          </div>
        </article>

        <aside className="dd-card dd-quality-card">
          <div className="dd-quality-icon"><Building2 size={22} /></div>
          <span className="dd-section-kicker">Data quality</span>
          <h2>Connect every deal to a company</h2>
          <p>Linked records give your team stronger context and more accurate account reporting.</p>
          <div className="dd-coverage">
            <div><span>Company coverage</span><strong>{loading ? '—' : `${companyCoverage}%`}</strong></div>
            <span><i style={{ width: `${companyCoverage}%` }} /></span>
          </div>
          <div className="dd-unlinked">
            <span><strong>{loading ? '—' : stats?.dealsWithoutCompany || 0}</strong> deals need attention</span>
            <button type="button" onClick={() => navigate('/deals?focus=no_company')}>Review deals <ArrowRight size={14} /></button>
          </div>
        </aside>
      </section>
    </main>
  )
}
