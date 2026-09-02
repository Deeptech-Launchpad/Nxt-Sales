import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import {
  Search, SlidersHorizontal, Plus, Upload, MoreHorizontal, Mail, Linkedin, X, User as UserRound,
  Building2, Briefcase as BriefcaseBusiness, CalendarClock, Copy, ExternalLink, Pencil, Trash2, Loader2,
  CheckCircle2, AlertCircle, Clock3, ChevronLeft, ChevronRight, Users, ArrowUpRight,
} from 'lucide-react'
import '../styles/prospect-board.css'

export const PROSPECT_STATUSES = ['New', 'Ready for Outreach', 'Contacted', 'Replied', 'Follow-up Required', 'Interested', 'Not Interested', 'Closed']
const CHANNELS = ['Email', 'LinkedIn', 'Email + LinkedIn']
const EMAIL_STATUSES = ['Unverified', 'Verified', 'Risky', 'Invalid']
const emptyForm = { firstName:'', lastName:'', jobTitle:'', companyName:'', email:'', emailStatus:'Unverified', linkedinUrl:'', linkedinStatus:'Not connected', channel:'Email', status:'New', ownerId:'', ownerName:'' }
const fmtDate = value => value ? new Intl.DateTimeFormat('en', { dateStyle:'medium' }).format(new Date(value)) : 'Never'
const initials = p => `${p.firstName?.[0] || ''}${p.lastName?.[0] || ''}`.toUpperCase() || 'P'

export default function ProspectBoard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState([]), [facets, setFacets] = useState([]), [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [selected, setSelected] = useState([]), [editing, setEditing] = useState(null), [detail, setDetail] = useState(null)
  const [showFilters, setShowFilters] = useState(false), [showImport, setShowImport] = useState(false), [menuId, setMenuId] = useState(null)
  const page = Number(params.get('page') || 1)
  const query = useMemo(() => Object.fromEntries([...params.entries()].filter(([,v]) => v)), [params])

  const load = async () => {
    setLoading(true); setError('')
    try { const { data } = await api.get('/prospects', { params: query }); setRows(data.prospects); setFacets(data.facets || []); setTotal(data.total) }
    catch (e) { setError(e.response?.data?.message || 'Unable to load prospects.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [params.toString()])
  useEffect(() => { const id = params.get('view'); if (id) api.get(`/prospects/${id}`).then(r => setDetail(r.data)).catch(() => setError('Prospect not found.')) }, [params.get('view')])

  const setFilter = (key, value) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); if (key !== 'page') next.set('page','1'); setParams(next) }
  const flash = message => { setNotice(message); setTimeout(() => setNotice(''), 2600) }
  const openDetail = async id => { setFilter('view', id); const { data } = await api.get(`/prospects/${id}`); setDetail(data) }
  const closeDetail = () => { const next = new URLSearchParams(params); next.delete('view'); setParams(next); setDetail(null) }
  const remove = async id => { if (!window.confirm('Remove this prospect?')) return; await api.delete(`/prospects/${id}`); setMenuId(null); closeDetail(); flash('Prospect removed.'); load() }
  const save = async form => { editing?.id ? await api.put(`/prospects/${editing.id}`, form) : await api.post('/prospects', form); setEditing(null); flash(editing?.id ? 'Prospect updated.' : 'Prospect added.'); load() }
  const bulk = async (action, status) => { await api.post('/prospects/bulk/action', { ids:selected, action, status }); setSelected([]); flash(`${selected.length} prospect${selected.length > 1 ? 's' : ''} updated.`); load() }
  const companies = [...new Set(facets.map(x => x.companyName).filter(Boolean))].sort()
  const owners = [...new Map(facets.filter(x => x.ownerId).map(x => [x.ownerId, { id:x.ownerId, name:x.ownerName || 'Owner' }])).values()]
  const allChecked = rows.length > 0 && rows.every(r => selected.includes(r.id))

  return <div className="pb-page">
    <div className="pb-page-head">
      <div><div className="pb-eyebrow"><Users size={14}/> Outreach workspace</div><h1>Prospect &amp; Channel Board</h1><p>Manage decision-makers, channel readiness, and one-to-one outreach from one workspace.</p></div>
      <div className="pb-head-actions"><button className="pb-btn secondary" onClick={() => setShowImport(true)}><Upload/>Import</button><button className="pb-btn primary" onClick={() => setEditing({ ...emptyForm, ownerId:user?.id || '', ownerName:user?.name || '' })}><Plus/>Add prospect</button></div>
    </div>

    <section className="pb-board-card">
      <div className="pb-toolbar">
        <label className="pb-search"><Search/><input value={params.get('search') || ''} onChange={e => setFilter('search', e.target.value)} placeholder="Search name, company, title, or email"/></label>
        <button className={`pb-filter-trigger ${showFilters ? 'active':''}`} onClick={() => setShowFilters(v => !v)}><SlidersHorizontal/>Filters{[...params].filter(([k]) => !['search','page','view'].includes(k)).length > 0 && <b>{[...params].filter(([k]) => !['search','page','view'].includes(k)).length}</b>}</button>
        <span className="pb-result-count">{total} prospect{total === 1 ? '' : 's'}</span>
      </div>
      {showFilters && <div className="pb-filters">
        <Filter label="Company" value={params.get('company')} onChange={v => setFilter('company',v)} options={companies}/>
        <label>Job title<input value={params.get('jobTitle') || ''} onChange={e => setFilter('jobTitle',e.target.value)} placeholder="e.g. Director"/></label>
        <Filter label="Channel" value={params.get('channel')} onChange={v => setFilter('channel',v)} options={CHANNELS}/>
        <Filter label="Status" value={params.get('status')} onChange={v => setFilter('status',v)} options={PROSPECT_STATUSES}/>
        <Filter label="Owner" value={params.get('owner')} onChange={v => setFilter('owner',v)} options={owners.map(o => ({ value:o.id,label:o.name }))}/>
        <Filter label="Last contacted" value={params.get('lastContacted')} onChange={v => setFilter('lastContacted',v)} options={[{value:'7',label:'Last 7 days'},{value:'30',label:'Last 30 days'},{value:'90',label:'Last 90 days'},{value:'never',label:'Never'}]}/>
        <button onClick={() => { const next = new URLSearchParams(); if (params.get('search')) next.set('search',params.get('search')); setParams(next) }}>Clear filters</button>
      </div>}
      {selected.length > 0 && <div className="pb-bulkbar"><strong>{selected.length} selected</strong><select defaultValue="" onChange={e => { if (e.target.value) bulk('status', e.target.value); e.target.value='' }}><option value="">Change status…</option>{PROSPECT_STATUSES.map(s => <option key={s}>{s}</option>)}</select><button onClick={() => bulk('delete')}><Trash2/>Remove</button><button className="quiet" onClick={() => setSelected([])}>Clear</button></div>}
      {error ? <State icon={<AlertCircle/>} title="We couldn't load this board" text={error} action={<button onClick={load}>Try again</button>}/> : loading ? <State icon={<Loader2 className="spin"/>} title="Loading prospects" text="Fetching the latest channel and outreach information."/> : rows.length === 0 ? <State icon={<UserRound/>} title="No prospects found" text={params.get('search') ? 'Try a different search or clear your filters.' : 'Add your first prospect or import a spreadsheet to begin outreach.'} action={<button onClick={() => setEditing({ ...emptyForm })}>Add prospect</button>}/> : <div className="pb-table-wrap"><table className="pb-table"><thead><tr><th className="check"><input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? selected.filter(id => !rows.some(r => r.id === id)) : [...new Set([...selected, ...rows.map(r => r.id)])])}/></th><th>Name</th><th>Job title</th><th>Company</th><th>Email address</th><th>LinkedIn</th><th>Channel</th><th>Status</th><th>Last contacted</th><th>Owner</th><th aria-label="Actions"/></tr></thead><tbody>{rows.map(p => <tr key={p.id} onDoubleClick={() => openDetail(p.id)}><td className="check"><input type="checkbox" checked={selected.includes(p.id)} onChange={() => setSelected(v => v.includes(p.id) ? v.filter(x => x !== p.id) : [...v,p.id])}/></td><td><button className="pb-person" onClick={() => openDetail(p.id)}><span>{initials(p)}</span><strong>{p.firstName} {p.lastName}</strong></button></td><td>{p.jobTitle || '—'}</td><td><span className="pb-company">{p.companyName || '—'}</span></td><td>{p.email ? <span className="pb-email"><Mail/>{p.email}<i className={p.emailStatus.toLowerCase()} title={p.emailStatus}/></span> : '—'}</td><td>{p.linkedinUrl ? <a className="pb-linkedin" href={p.linkedinUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}><Linkedin/>Profile<ExternalLink/></a> : '—'}</td><td><Channel value={p.channel}/></td><td><Status value={p.status}/></td><td>{fmtDate(p.lastContacted)}</td><td>{p.ownerName || 'Unassigned'}</td><td className="pb-actions-cell"><button onClick={() => setMenuId(menuId === p.id ? null : p.id)}><MoreHorizontal/></button>{menuId === p.id && <div className="pb-row-menu"><button onClick={() => openDetail(p.id)}>View profile</button><button onClick={() => navigate(`/outreach/single-mail?prospect=${p.id}`)} disabled={!p.email}>Send email</button><button onClick={() => {setEditing(p);setMenuId(null)}}>Edit</button><button className="danger" onClick={() => remove(p.id)}>Remove</button></div>}</td></tr>)}</tbody></table></div>}
      <div className="pb-pagination"><span>Showing {rows.length ? (page-1)*25+1 : 0}–{Math.min(page*25,total)} of {total}</span><div><button disabled={page<=1} onClick={() => setFilter('page',String(page-1))}><ChevronLeft/></button><b>Page {page}</b><button disabled={page*25>=total} onClick={() => setFilter('page',String(page+1))}><ChevronRight/></button></div></div>
    </section>
    {notice && <div className="pb-toast"><CheckCircle2/>{notice}</div>}
    {editing && <ProspectModal value={editing} onClose={() => setEditing(null)} onSave={save}/>} 
    {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={result => {setShowImport(false);flash(`${result.created} prospects imported.`);load()}}/>}
    {detail && <ProspectDetail prospect={detail} onClose={closeDetail} onEdit={() => {setEditing(detail);closeDetail()}} onDelete={() => remove(detail.id)} onRefresh={() => openDetail(detail.id)} onEmail={() => navigate(`/outreach/single-mail?prospect=${detail.id}`)}/>} 
  </div>
}

function Filter({ label, value='', onChange, options }) { return <label>{label}<select value={value || ''} onChange={e => onChange(e.target.value)}><option value="">All</option>{options.map(o => typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}</select></label> }
function Status({ value }) { return <span className={`pb-status s-${value.toLowerCase().replaceAll(' ','-')}`}>{value}</span> }
function Channel({ value }) { return <span className="pb-channel">{value.includes('Email') && <Mail/>}{value.includes('LinkedIn') && <Linkedin/>}{value}</span> }
function State({ icon,title,text,action }) { return <div className="pb-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div> }

function ProspectModal({ value, onClose, onSave }) {
  const [form,setForm] = useState({ ...emptyForm, ...value }), [saving,setSaving] = useState(false), [error,setError] = useState('')
  const submit = async e => { e.preventDefault(); if (!form.firstName.trim()) return setError('First name is required.'); setSaving(true); try { await onSave(form) } catch(err) { setError(err.response?.data?.message || 'Unable to save prospect.') } finally { setSaving(false) } }
  return <div className="pb-modal-backdrop"><form className="pb-modal" onSubmit={submit}><header><div><span><UserRound/></span><div><h2>{value.id ? 'Edit prospect' : 'Add prospect'}</h2><p>Contact identity and channel readiness</p></div></div><button type="button" onClick={onClose}><X/></button></header><div className="pb-modal-body"><div className="pb-form-grid"><Field label="First name *" value={form.firstName} onChange={v => setForm({...form,firstName:v})}/><Field label="Last name" value={form.lastName} onChange={v => setForm({...form,lastName:v})}/><Field label="Job title" value={form.jobTitle} onChange={v => setForm({...form,jobTitle:v})}/><Field label="Company" value={form.companyName} onChange={v => setForm({...form,companyName:v})}/><Field label="Email address" type="email" value={form.email} onChange={v => setForm({...form,email:v})}/><SelectField label="Email status" value={form.emailStatus} options={EMAIL_STATUSES} onChange={v => setForm({...form,emailStatus:v})}/><Field label="LinkedIn profile URL" type="url" value={form.linkedinUrl} onChange={v => setForm({...form,linkedinUrl:v})}/><Field label="LinkedIn status" value={form.linkedinStatus} onChange={v => setForm({...form,linkedinStatus:v})}/><SelectField label="Preferred channel" value={form.channel} options={CHANNELS} onChange={v => setForm({...form,channel:v})}/><SelectField label="Contact status" value={form.status} options={PROSPECT_STATUSES} onChange={v => setForm({...form,status:v})}/><Field className="span-2" label="Owner name" value={form.ownerName} onChange={v => setForm({...form,ownerName:v})}/></div>{error && <p className="pb-form-error"><AlertCircle/>{error}</p>}</div><footer><button type="button" className="pb-btn secondary" onClick={onClose}>Cancel</button><button className="pb-btn primary" disabled={saving}>{saving ? <Loader2 className="spin"/> : <CheckCircle2/>}{saving ? 'Saving…' : 'Save prospect'}</button></footer></form></div>
}
function Field({label,value,onChange,type='text',className=''}) { return <label className={className}>{label}<input type={type} value={value || ''} onChange={e => onChange(e.target.value)}/></label> }
function SelectField({label,value,onChange,options}) { return <label>{label}<select value={value} onChange={e => onChange(e.target.value)}>{options.map(x => <option key={x}>{x}</option>)}</select></label> }

function ImportModal({ onClose,onDone }) {
  const ref=useRef(), [rows,setRows]=useState([]), [error,setError]=useState(''), [saving,setSaving]=useState(false)
  const parse = file => { setError(''); const done = data => setRows(data.filter(r => Object.values(r).some(Boolean)).map(r => ({ firstName:r['First Name']||r.firstName||r.Name||'', lastName:r['Last Name']||r.lastName||'', jobTitle:r['Job Title']||r.jobTitle||'', companyName:r.Company||r.companyName||'', email:r.Email||r.email||'', linkedinUrl:r.LinkedIn||r.linkedinUrl||'', channel:r.Channel||r.channel||'Email', status:r.Status||r.status||'New', ownerName:r.Owner||r.ownerName||'' }))) ; if(file.name.toLowerCase().endsWith('.csv')) Papa.parse(file,{header:true,skipEmptyLines:true,complete:r=>done(r.data),error:e=>setError(e.message)}); else { const reader=new FileReader(); reader.onload=e=>{const wb=XLSX.read(e.target.result,{type:'array'});done(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]))}; reader.readAsArrayBuffer(file) } }
  const upload=async()=>{if(!rows.length)return setError('Choose a CSV or XLSX file first.');setSaving(true);try{const {data}=await api.post('/prospects/bulk/import',{rows});onDone(data)}catch(e){setError(e.response?.data?.message||'Import failed.')}finally{setSaving(false)}}
  return <div className="pb-modal-backdrop"><div className="pb-modal pb-import"><header><div><span><Upload/></span><div><h2>Import prospects</h2><p>CSV or XLSX with a header row</p></div></div><button onClick={onClose}><X/></button></header><div className="pb-modal-body"><button className="pb-dropzone" onClick={()=>ref.current.click()}><Upload/><strong>Choose CSV or XLSX file</strong><span>Expected columns: First Name, Last Name, Job Title, Company, Email, LinkedIn, Channel, Status, Owner</span></button><input ref={ref} hidden type="file" accept=".csv,.xlsx,.xls" onChange={e=>e.target.files[0]&&parse(e.target.files[0])}/>{rows.length>0&&<div className="pb-import-summary"><CheckCircle2/><strong>{rows.length} rows ready</strong><span>{rows.slice(0,3).map(r=>`${r.firstName} ${r.lastName}`).join(', ')}{rows.length>3?'…':''}</span></div>}{error&&<p className="pb-form-error"><AlertCircle/>{error}</p>}</div><footer><button className="pb-btn secondary" onClick={onClose}>Cancel</button><button className="pb-btn primary" onClick={upload} disabled={saving}>{saving?'Importing…':`Import ${rows.length || ''} prospects`}</button></footer></div></div>
}

function ProspectDetail({ prospect,onClose,onEdit,onDelete,onRefresh,onEmail }) {
  const copy=async()=>{await navigator.clipboard.writeText(prospect.email||'')}
  return <div className="pb-drawer-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><aside className="pb-detail"><header><button onClick={onClose}><X/></button><div className="pb-detail-person"><span>{initials(prospect)}</span><div><h2>{prospect.firstName} {prospect.lastName}</h2><p>{prospect.jobTitle || 'No job title'}{prospect.companyName ? ` at ${prospect.companyName}`:''}</p><Status value={prospect.status}/></div></div><div className="pb-detail-actions"><button onClick={onEdit}><Pencil/>Edit</button><button className="danger" onClick={onDelete}><Trash2/>Remove</button></div></header><div className="pb-detail-scroll"><section className="pb-info-strip"><div><Building2/><span>Company<strong>{prospect.companyName||'Not provided'}</strong></span></div><div><BriefcaseBusiness/><span>Role<strong>{prospect.jobTitle||'Not provided'}</strong></span></div><div><CalendarClock/><span>Last contacted<strong>{fmtDate(prospect.lastContacted)}</strong></span></div></section><section className="pb-channel-card email"><div className="pb-card-head"><span><Mail/></span><div><h3>Email</h3><p>Direct one-to-one outreach</p></div><em className={prospect.emailStatus.toLowerCase()}>{prospect.emailStatus}</em></div><div className="pb-channel-value"><span>Primary email</span><strong>{prospect.email||'No email address'}</strong></div><div className="pb-channel-meta"><span>Last email sent</span><strong>{fmtDate(prospect.activities?.find(a=>a.type==='email')?.createdAt)}</strong></div><div className="pb-card-actions"><button className="pb-btn primary" onClick={onEmail} disabled={!prospect.email}><Mail/>Send email</button><button className="pb-btn secondary" onClick={copy} disabled={!prospect.email}><Copy/>Copy email</button></div></section><section className="pb-channel-card linkedin"><div className="pb-card-head"><span><Linkedin/></span><div><h3>LinkedIn</h3><p>External professional profile</p></div><em>{prospect.linkedinStatus||'Unknown'}</em></div><div className="pb-channel-value"><span>Profile URL</span><strong>{prospect.linkedinUrl||'No LinkedIn profile'}</strong></div><div className="pb-card-actions"><a className="pb-btn linkedin" href={prospect.linkedinUrl||'#'} target="_blank" rel="noreferrer" aria-disabled={!prospect.linkedinUrl}><Linkedin/>Open LinkedIn profile<ArrowUpRight/></a></div></section><section className="pb-timeline"><div className="pb-section-title"><div><h3>Activity timeline</h3><p>Contact and outreach history</p></div><button onClick={onRefresh}>Refresh</button></div>{prospect.activities?.length ? prospect.activities.map(a=><div className="pb-timeline-row" key={a.id}><span className={`type-${a.type}`}>{a.type==='email'?<Mail/>:a.type==='scheduled'?<Clock3/>:<CheckCircle2/>}</span><div><strong>{a.title}</strong>{a.detail&&<p>{a.detail}</p>}<small>{fmtDate(a.createdAt)} · {a.createdBy||'System'}</small></div></div>) : <div className="pb-empty-timeline">No activity recorded yet.</div>}</section></div></aside></div>
}
