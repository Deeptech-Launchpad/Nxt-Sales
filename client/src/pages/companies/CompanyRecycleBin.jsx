import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronLeft, RotateCcw, Trash2 } from 'lucide-react'
import api from '../../api/client'
import '../../styles/contacts.css'
import '../../styles/companies.css'

const RETENTION_DAYS = 30

function daysRemaining(deletedAt) {
  const purgeAt = new Date(deletedAt).getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)))
}

export default function CompanyRecycleBin() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [selected, setSelected]   = useState([])
  const [busy, setBusy]           = useState(false)
  const [message, setMessage]     = useState(null) // { type: 'error'|'success', text }

  const fetchBin = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/companies/recycle-bin', { params: { ...(search && { search }) } })
      setCompanies(data.companies || [])
    } catch {
      setCompanies([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchBin() }, [fetchBin])

  const allSelected = companies.length > 0 && selected.length === companies.length
  const toggleAll = () => setSelected(allSelected ? [] : companies.map(c => c.id))
  const toggleOne = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const restoreSelected = async () => {
    if (!selected.length) return
    setBusy(true); setMessage(null)
    try {
      const { data } = await api.post('/companies/recycle-bin/restore', { ids: selected })
      const { restored, conflicts } = data
      if (conflicts?.length) {
        setMessage({
          type: 'error',
          text: `${conflicts.length} compan${conflicts.length === 1 ? 'y' : 'ies'} could NOT be restored — a duplicate already exists: ` +
            conflicts.map(c => `"${c.name}" conflicts with existing "${c.conflictWith.name}"`).join('; '),
        })
      } else if (restored?.length) {
        setMessage({ type: 'success', text: `Restored ${restored.length} compan${restored.length === 1 ? 'y' : 'ies'}.` })
      }
      setSelected([])
      fetchBin()
    } catch (err) {
      setMessage({ type: 'error', text: err?.response?.data?.message || 'Restore failed.' })
    } finally {
      setBusy(false)
    }
  }

  const permanentlyDeleteSelected = async () => {
    if (!selected.length) return
    if (!window.confirm(`Permanently delete ${selected.length} selected compan${selected.length === 1 ? 'y' : 'ies'}? This CANNOT be undone.`)) return
    setBusy(true); setMessage(null)
    try {
      await api.post('/companies/recycle-bin/permanent-delete', { ids: selected })
      setSelected([])
      fetchBin()
    } catch (err) {
      setMessage({ type: 'error', text: err?.response?.data?.message || 'Permanent delete failed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="contacts-container companies-page">
      <div className="contacts-header">
        <div className="header-left">
          <span className="detail-back-link" style={{ cursor: 'pointer', marginBottom: 6, display: 'inline-flex' }} onClick={() => navigate('/companies')}>
            <ChevronLeft size={14} /> Companies
          </span>
          <h1 className="contacts-title">Recycle Bin</h1>
          <span className="records-count">{companies.length} deleted compan{companies.length === 1 ? 'y' : 'ies'}</span>
        </div>
        <div className="header-actions">
          {selected.length > 0 && (
            <div className="action-group">
              <button className="btn-action" onClick={restoreSelected} disabled={busy}>
                <RotateCcw size={14} /> {busy ? 'Working…' : `Restore selected (${selected.length})`}
              </button>
              <button
                className="btn-action"
                style={{ color: '#ef4444' }}
                onClick={permanentlyDeleteSelected}
                disabled={busy}
              >
                <Trash2 size={14} /> Permanently delete ({selected.length})
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="filter-chips-row">
        <div className="chips-right" style={{ marginLeft: 'auto' }}>
          <div className="search-box">
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search deleted companies"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {message && (
        <div style={{
          margin: '0 0 14px', padding: '10px 14px', borderRadius: 6, fontSize: 16,
          background: message.type === 'error' ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${message.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          color: message.type === 'error' ? '#991b1b' : '#166534',
        }}>
          {message.text}
        </div>
      )}

      <div className="contacts-table-wrapper">
        <table className="contacts-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
              <th>COMPANY</th>
              <th>DELETED ON</th>
              <th>DAYS REMAINING</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#475467' }}>Loading...</td></tr>
            ) : companies.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#475467' }}>Recycle Bin is empty</td></tr>
            ) : companies.map(c => {
              const remaining = daysRemaining(c.deletedAt)
              return (
                <tr key={c.id}>
                  <td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleOne(c.id)} /></td>
                  <td className="name-cell">
                    <span className="avatar" style={{ fontSize: '10px', letterSpacing: '-0.5px' }}>
                      {(c.name || '??').slice(0, 2).toUpperCase()}
                    </span>
                    <span>{c.name}</span>
                  </td>
                  <td>{new Date(c.deletedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td style={{ color: remaining <= 5 ? '#ef4444' : '#334155', fontWeight: remaining <= 5 ? 600 : 400 }}>
                    {remaining} day{remaining === 1 ? '' : 's'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
