import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Briefcase, Building2, CalendarCheck,
  CheckCircle, ChevronRight, Mail, PhoneCall, Plus, Sparkles,
  Quote, RefreshCw, Target, TrendingUp, Trophy, Flame, Play, Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { formatCurrency } from '../utils/formatCurrency'
import { getMotivationQuote } from '../utils/motivationQuotes'
import '../styles/main-dashboard.css'

const toneForStage = stage => {
  const normalized = String(stage || '').toLowerCase()
  if (normalized === 'won') return 'won'
  if (normalized === 'lost') return 'lost'
  if (normalized.includes('qualif')) return 'qualified'
  return 'active'
}

const greetingForNow = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function AnimatedNumber({ value, loading }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (loading) return
    const target = Number(value ?? 0)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(target)
      return
    }
    let frame
    const started = performance.now()
    const tick = now => {
      const progress = Math.min((now - started) / 620, 1)
      setDisplay(Math.round(target * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, loading])

  if (loading) return <span className="md-skeleton md-skeleton--number" aria-label="Loading" />
  return display.toLocaleString()
}

function ListSkeleton() {
  return <div className="md-list-skeleton" aria-label="Loading">{[1, 2, 3, 4].map(item => <span key={item} />)}</div>
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const firstName = user?.name?.split(' ')[0] || 'there'

  const [deals, setDeals] = useState([])
  const [dealsLoading, setDealsLoading] = useState(true)
  const [kpis, setKpis] = useState(null)
  const [kpisLoading, setKpisLoading] = useState(true)
  const [profileStyle, setProfileStyle] = useState({ avatar: '', coverQuote: '' })
  const [motivation, setMotivation] = useState(() => getMotivationQuote())
  const [nextActions, setNextActions] = useState([])
  const [actionsLoading, setActionsLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState('')
  const [actionNotice, setActionNotice] = useState('')

  useEffect(() => {
    let alive = true
    api.get('/deals')
      .then(response => { if (alive) setDeals(Array.isArray(response.data) ? response.data : []) })
      .catch(() => {})
      .finally(() => { if (alive) setDealsLoading(false) })
    return () => { alive = false }
  }, [])

  const loadNextActions = () => {
    setActionsLoading(true)
    return api.get('/dashboard/next-actions')
      .then(response => setNextActions(response.data?.actions || []))
      .catch(() => setNextActions([]))
      .finally(() => setActionsLoading(false))
  }

  useEffect(() => { loadNextActions() }, [])

  const startFollowUp = async (item) => {
    if (item.sequence) {
      navigate('/tasks')
      return
    }
    setActionBusy(item.company.id)
    setActionNotice('')
    try {
      const response = await api.post('/dashboard/follow-up-sequences', { companyId: item.company.id })
      setActionNotice(response.data?.message || 'Follow-up plan started.')
      await loadNextActions()
    } catch (error) {
      setActionNotice(error.response?.data?.message || 'Could not start the follow-up plan.')
    } finally {
      setActionBusy('')
    }
  }

  useEffect(() => {
    let alive = true
    api.get('/users/me/personalization')
      .then(response => { if (alive) setProfileStyle(response.data || {}) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    api.get('/dashboard/stats')
      .then(response => { if (alive) setKpis(response.data) })
      .catch(() => {})
      .finally(() => { if (alive) setKpisLoading(false) })
    return () => { alive = false }
  }, [])

  const activeDeals = deals.filter(deal => !/won|lost/i.test(deal.stage || ''))
  const wonDeals = deals.filter(deal => /won/i.test(deal.stage || ''))
  const pocDeals = deals.filter(deal => deal.poc)
  const proposalDeals = deals.filter(deal => deal.proposalShared)
  const recentDeals = deals.slice(0, 6)
  const todayTasks = kpis?.todayTasks || []
  const attentionTotal = (kpis?.followUpsDueToday || 0) + (kpis?.tasksOverdue || 0)

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const pulseCards = [
    { label: 'Companies', value: kpis?.totalCompanies, helper: 'Total accounts', Icon: Building2, tone: 'blue', to: '/companies', loading: kpisLoading },
    { label: 'Active deals', value: activeDeals.length, helper: 'Moving forward', Icon: Briefcase, tone: 'green', to: '/deals?focus=active', loading: dealsLoading },
    { label: 'Won this month', value: kpis?.wonClientsThisMonth, helper: 'Closed clients', Icon: Trophy, tone: 'violet', to: '/deals?focus=won', loading: kpisLoading },
    { label: 'Calls today', value: kpis?.callsToday, helper: 'Conversations', Icon: PhoneCall, tone: 'amber', to: '/calls', loading: kpisLoading },
  ]

  const quickActions = [
    { label: 'New deal', description: 'Add an opportunity', Icon: Plus, to: '/deals', tone: 'blue' },
    { label: 'Send email', description: 'Start a conversation', Icon: Mail, to: '/email', tone: 'green' },
    { label: 'Create task', description: 'Plan the next step', Icon: CheckCircle, to: '/tasks', tone: 'violet' },
  ]

  const openDeal = deal => deal.company?.id ? navigate(`/companies/${deal.company.id}`) : navigate('/deals')

  return (
    <main className="md-page">
      <section className="md-hero md-reveal">
        <div className="md-hero-copy">
          <span className="md-eyebrow"><Sparkles size={13} /> Daily sales briefing</span>
          <h1>{greetingForNow()}, <span>{firstName}</span></h1>
          <p>{todayLabel}</p>
          <div className="md-hero-message">
            {attentionTotal > 0
              ? <>You have <strong>{attentionTotal} items</strong> that need attention today. Let’s turn priorities into progress.</>
              : <>Your priority queue is clear. A great time to build new pipeline.</>}
          </div>
        </div>

        <div className="md-hero-actions">
          <button type="button" className="md-primary-action" onClick={() => navigate('/tasks')}>
            Open today’s work <ArrowRight size={16} />
          </button>
          <span><i /> Live workspace</span>
          <div className="md-daily-quote">
            <div className="md-quote-profile">
              {profileStyle.avatar
                ? <img src={profileStyle.avatar} alt="" />
                : <b>{firstName.charAt(0).toUpperCase()}</b>}
              <span>Today’s motivation</span>
              <button type="button" title="Show another quote" aria-label="Show another quote" onClick={() => setMotivation(current => getMotivationQuote(current.text))}><RefreshCw size={13} /></button>
            </div>
            <p><Quote size={12} />{motivation.text}</p>
          </div>
        </div>

        <div className="md-hero-pulse">
          <div><span>Deals in progress</span><strong><AnimatedNumber value={kpis?.dealsInProgress} loading={kpisLoading} /></strong></div>
          <div><span>Today’s tasks</span><strong><AnimatedNumber value={todayTasks.length} loading={kpisLoading} /></strong></div>
          <div><span>Won deals</span><strong><AnimatedNumber value={wonDeals.length} loading={dealsLoading} /></strong></div>
        </div>
      </section>

      <section className="md-pulse-grid md-reveal md-delay-1" aria-label="Business pulse">
        {pulseCards.map(({ label, value, helper, Icon, tone, to, loading }) => (
          <button type="button" className={`md-pulse-card md-tone-${tone}`} key={label} onClick={() => navigate(to)}>
            <span className="md-pulse-icon"><Icon size={19} /></span>
            <span className="md-pulse-copy"><small>{label}</small><strong><AnimatedNumber value={value} loading={loading} /></strong><em>{helper}</em></span>
            <ChevronRight size={17} />
          </button>
        ))}
      </section>

      <section className="md-dashboard-grid md-reveal md-delay-2">
        <article className="md-card md-tasks-card md-best-actions-card">
          <header className="md-card-head">
            <div>
              <span className="md-section-kicker"><Zap size={10} /> Smart priority queue</span>
              <h2>Today’s best actions <em>{!actionsLoading && nextActions.length}</em></h2>
              <p>Ranked using live engagement, pipeline progress and urgency.</p>
            </div>
            <button type="button" className="md-text-action" onClick={loadNextActions}><RefreshCw size={13} /> Refresh</button>
          </header>

          {actionNotice && <div className="md-action-notice"><CheckCircle size={14} /> {actionNotice}</div>}
          <div className="md-best-action-list">
            {actionsLoading ? <ListSkeleton /> : nextActions.length ? nextActions.slice(0, 6).map((item, index) => (
              <div className="md-best-action" key={item.company.id}>
                <button type="button" className="md-best-action-main" onClick={() => navigate(item.action.path)}>
                  <span className={`md-lead-score md-lead-score--${item.temperature.toLowerCase()}`}>
                    {item.temperature === 'Hot' ? <Flame size={13} /> : <TrendingUp size={13} />}
                    <strong>{item.score}</strong><small>{item.temperature}</small>
                  </span>
                  <span className="md-best-action-copy">
                    <span><b>{String(index + 1).padStart(2, '0')}</b>{item.company.name}</span>
                    <strong>{item.action.title}</strong>
                    <small>{item.action.reason}</small>
                    <em>{item.signals.slice(0, 2).map(signal => signal.label).join(' · ')}</em>
                  </span>
                </button>
                <button type="button" className={`md-sequence-action${item.sequence ? ' is-active' : ''}`} disabled={actionBusy === item.company.id} onClick={() => startFollowUp(item)}>
                  {item.sequence ? <><CheckCircle size={13} /> Step {item.sequence.currentStep}/{item.sequence.totalSteps}</> : <><Play size={13} /> Start follow-up</>}
                </button>
              </div>
            )) : (
              <div className="md-empty-state"><span><CheckCircle size={21} /></span><div><strong>Priority queue is clear</strong><p>New activity will create fresh recommendations.</p></div></div>
            )}
          </div>
        </article>

        <aside className="md-side-stack">
          <article className="md-card md-attention-card">
            <header className="md-card-head">
              <div><span className="md-section-kicker">Needs action</span><h2>Focus today</h2><p>Handle the most time-sensitive work first.</p></div>
            </header>
            <button type="button" className="md-attention-row md-attention-row--amber" onClick={() => navigate('/tasks')}>
              <span><CalendarCheck size={18} /></span><div><small>Follow-ups due</small><strong><AnimatedNumber value={kpis?.followUpsDueToday} loading={kpisLoading} /></strong></div><ChevronRight size={17} />
            </button>
            <button type="button" className="md-attention-row md-attention-row--red" onClick={() => navigate('/tasks')}>
              <span><AlertTriangle size={18} /></span><div><small>Overdue tasks</small><strong><AnimatedNumber value={kpis?.tasksOverdue} loading={kpisLoading} /></strong></div><ChevronRight size={17} />
            </button>
          </article>

          <article className="md-card md-quick-card">
            <header className="md-card-head"><div><span className="md-section-kicker">Shortcuts</span><h2>Quick actions</h2></div></header>
            <div className="md-quick-grid">
              {quickActions.map(({ label, description, Icon, to, tone }) => (
                <button type="button" key={label} onClick={() => navigate(to)} className={`md-quick md-quick--${tone}`}>
                  <span><Icon size={16} /></span><div><strong>{label}</strong><small>{description}</small></div><ArrowRight size={15} />
                </button>
              ))}
            </div>
          </article>
        </aside>
      </section>

      <section className="md-lower-grid md-reveal md-delay-3">
        <article className="md-card md-recent-card">
          <header className="md-card-head">
            <div><span className="md-section-kicker">Pipeline movement</span><h2>Recent opportunities</h2><p>Fresh deals and the accounts behind them.</p></div>
            <button type="button" className="md-text-action" onClick={() => navigate('/deals')}>View pipeline <ArrowRight size={14} /></button>
          </header>
          <div className="md-deals-table">
            <div className="md-table-head"><span>Opportunity</span><span>Stage</span><span>Value</span><span>Created</span><span /></div>
            {dealsLoading ? <ListSkeleton /> : recentDeals.length ? recentDeals.map(deal => (
              <button type="button" className="md-deal-row" key={deal.id} onClick={() => openDeal(deal)}>
                <span className="md-deal-name"><i><Briefcase size={15} /></i><span><strong>{deal.title}</strong><small>{deal.company?.name || 'No company linked'}</small></span></span>
                <span><em className={`md-stage md-stage--${toneForStage(deal.stage)}`}>{deal.stage || 'No stage'}</em></span>
                <strong className="md-deal-value">{deal.value ? formatCurrency(deal.value, deal.currency || 'USD') : '—'}</strong>
                <span className="md-deal-date">{deal.createdAt ? new Date(deal.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</span>
                <ChevronRight size={16} />
              </button>
            )) : <div className="md-empty-state"><span><TrendingUp size={21} /></span><div><strong>No deals yet</strong><p>Create your first opportunity to get started.</p></div></div>}
          </div>
        </article>

        <aside className="md-card md-momentum-card">
          <span className="md-section-kicker">Sales momentum</span>
          <h2>Move opportunities forward</h2>
          <p>These milestones show how far your active pipeline has progressed.</p>
          <div className="md-momentum-stat md-momentum-stat--blue"><span><Target size={17} /> POC initiated</span><strong>{dealsLoading ? '—' : pocDeals.length}</strong></div>
          <div className="md-momentum-stat md-momentum-stat--violet"><span><CheckCircle size={17} /> Proposals shared</span><strong>{dealsLoading ? '—' : proposalDeals.length}</strong></div>
          <div className="md-momentum-progress">
            <div><span>Proposal readiness</span><strong>{activeDeals.length ? Math.round((proposalDeals.length / activeDeals.length) * 100) : 0}%</strong></div>
            <span><i style={{ width: `${Math.min(100, activeDeals.length ? (proposalDeals.length / activeDeals.length) * 100 : 0)}%` }} /></span>
          </div>
          <button type="button" onClick={() => navigate('/deals-dashboard')}>Open deals analytics <ArrowRight size={15} /></button>
        </aside>
      </section>
    </main>
  )
}
