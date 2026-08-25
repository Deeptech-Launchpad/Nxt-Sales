import { useEffect, useRef, useState } from 'react'
import {
  Calendar, Camera, CheckCircle, ImagePlus, Mail, Quote, RefreshCw,
  Save, Shield, Trash2, User as UserIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { compressImageIfNeeded } from '../utils/imageCompress'
import { getMotivationQuote } from '../utils/motivationQuotes'
import '../styles/profile.css'

const readImage = async file => {
  const compressed = await compressImageIfNeeded(file)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(compressed)
  })
}

export default function Profile() {
  const { user: authUser, updateUser } = useAuth()
  const [user, setUser] = useState(authUser || null)
  const [avatar, setAvatar] = useState(authUser?.avatar || '')
  const [coverImage, setCoverImage] = useState('')
  const [coverQuote, setCoverQuote] = useState('')
  const [motivation, setMotivation] = useState(() => getMotivationQuote())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState('')
  const [notice, setNotice] = useState(null)
  const avatarInputRef = useRef(null)
  const coverInputRef = useRef(null)

  useEffect(() => {
    let alive = true
    Promise.allSettled([api.get('/auth/me'), api.get('/users/me/personalization')])
      .then(([account, personalization]) => {
        if (!alive) return
        if (account.status === 'fulfilled' && account.value.data) {
          setUser(current => ({ ...current, ...account.value.data }))
          setAvatar(account.value.data.avatar || '')
        }
        if (personalization.status === 'fulfilled') {
          const data = personalization.value.data || {}
          setAvatar(data.avatar || '')
          setCoverImage(data.coverImage || '')
          setCoverQuote(data.coverQuote || '')
        }
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const showNotice = (message, type = 'success') => {
    setNotice({ message, type })
    window.setTimeout(() => setNotice(null), 3200)
  }

  const handleImage = async (event, kind) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return showNotice('Please choose an image file.', 'error')
    setProcessing(kind)
    try {
      const dataUrl = await readImage(file)
      if (kind === 'avatar') setAvatar(dataUrl)
      else setCoverImage(dataUrl)
    } catch {
      showNotice('That image could not be processed. Please try another one.', 'error')
    } finally {
      setProcessing('')
    }
  }

  const savePersonalization = async () => {
    setSaving(true)
    try {
      const response = await api.put('/users/me/personalization', { avatar, coverImage, coverQuote })
      const saved = response.data || {}
      setAvatar(saved.avatar || '')
      setCoverImage(saved.coverImage || '')
      setCoverQuote(saved.coverQuote || '')
      updateUser({ avatar: saved.avatar || null })
      setUser(current => ({ ...current, avatar: saved.avatar || null }))
      showNotice('Your profile style has been saved.')
    } catch (error) {
      showNotice(error?.response?.data?.message || 'Unable to save your profile.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const initials = user?.name
    ? user.name.split(' ').map(name => name[0]).join('').toUpperCase().slice(0, 2)
    : 'U'
  const cap = value => value ? value.charAt(0).toUpperCase() + value.slice(1) : '—'
  const fmtDate = value => value
    ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'

  const rows = [
    { label: 'Full name', value: user?.name || '—', Icon: UserIcon },
    { label: 'Email address', value: user?.email || '—', Icon: Mail },
    { label: 'Role', value: cap(user?.role), Icon: Shield },
    { label: 'Status', value: cap(user?.status), Icon: CheckCircle },
    { label: 'Member since', value: fmtDate(user?.createdAt), Icon: Calendar },
  ]

  return (
    <main className="pr-page">
      <header className="pr-page-head">
        <div>
          <span>Personal workspace</span>
          <h1>My Profile</h1>
          <p>Make the workspace feel yours and carry your motivation into every day.</p>
        </div>
        <button type="button" className="pr-save" onClick={savePersonalization} disabled={saving || !!processing}>
          <Save size={16} /> {saving ? 'Saving…' : 'Save profile'}
        </button>
      </header>

      {notice && <div className={`pr-notice ${notice.type}`}>{notice.message}</div>}

      <section
        className={`pr-cover ${coverImage ? 'has-image' : ''}`}
        style={coverImage ? { backgroundImage: `linear-gradient(90deg,rgba(6,23,70,.88),rgba(9,48,116,.5)),url(${coverImage})` } : undefined}
      >
        <div className="pr-cover-actions">
          <button type="button" onClick={() => coverInputRef.current?.click()} disabled={processing === 'cover'}>
            <ImagePlus size={15} /> {processing === 'cover' ? 'Processing…' : coverImage ? 'Change cover' : 'Add cover'}
          </button>
          {coverImage && <button type="button" className="subtle" onClick={() => setCoverImage('')}><Trash2 size={14} /> Remove</button>}
          <input ref={coverInputRef} type="file" accept="image/*" onChange={event => handleImage(event, 'cover')} hidden />
        </div>

        <blockquote><Quote size={19} />{coverQuote || 'Add a personal quote that keeps your best work in focus.'}</blockquote>

        <div className="pr-identity">
          <div className="pr-avatar-wrap">
            {avatar ? <img src={avatar} alt={user?.name || 'Profile'} /> : <span>{initials}</span>}
            <button type="button" aria-label="Change profile photo" title="Change profile photo" onClick={() => avatarInputRef.current?.click()} disabled={processing === 'avatar'}>
              <Camera size={15} />
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={event => handleImage(event, 'avatar')} hidden />
          </div>
          <div>
            <h2>{user?.name || 'User'}</h2>
            <p>{user?.email || ''}</p>
            <span>{cap(user?.role)}</span>
          </div>
          {avatar && <button type="button" className="pr-remove-avatar" onClick={() => setAvatar('')}>Remove photo</button>}
        </div>
      </section>

      <section className="pr-grid">
        <article className="pr-card pr-personalize-card">
          <header><span><Quote size={17} /></span><div><h3>Cover message</h3><p>Write a short line that appears over your cover image.</p></div></header>
          <label htmlFor="cover-quote">Your quote</label>
          <textarea
            id="cover-quote"
            maxLength={180}
            rows={4}
            value={coverQuote}
            onChange={event => setCoverQuote(event.target.value)}
            placeholder="e.g. Create value in every conversation."
          />
          <small>{coverQuote.length}/180 characters</small>
          <div className="pr-image-tips"><ImagePlus size={15} /><span>For the best cover, use a wide image at least 1400 × 500 px.</span></div>
        </article>

        <aside className="pr-card pr-motivation-card">
          <header><span><RefreshCw size={17} /></span><div><h3>Fresh motivation</h3><p>A new positive thought on every refresh.</p></div></header>
          <Quote size={25} className="pr-quote-mark" />
          <blockquote>{motivation.text}</blockquote>
          <footer><span>{motivation.author}</span><button type="button" onClick={() => setMotivation(current => getMotivationQuote(current.text))}><RefreshCw size={14} /> New quote</button></footer>
        </aside>

        <article className="pr-card pr-account-card">
          <header><span><UserIcon size={17} /></span><div><h3>Account details</h3><p>Your workspace identity and access information.</p></div></header>
          <div className="pr-details">
            {rows.map(({ label, value, Icon }) => (
              <div key={label}><span><Icon size={15} /></span><small>{label}</small><strong>{loading && value === '—' ? 'Loading…' : value}</strong></div>
            ))}
          </div>
        </article>
      </section>
    </main>
  )
}
