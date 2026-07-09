import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import api from '../api/client'

const NotificationContext = createContext(null)
export const useNotifications = () => useContext(NotificationContext)

// localStorage keys — read/cleared state lives client-side (no DB schema change).
const LS_LIST   = 'mwz_notifications'          // the notification list (with read flags)
const LS_EMAILS = 'mwz_notif_known_emails'     // inbound email ids already accounted for
const LS_MTGS   = 'mwz_notif_fired_meetings'   // meeting ids already reminded
const LS_OPENS  = 'mwz_notif_known_opens'      // sent-email open events already alerted
const POLL_MS   = 60_000
const HOUR_MS   = 60 * 60 * 1000

const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback } catch { return fallback } }
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore quota */ } }

function linkFor(a) {
  if (a.contactId) return `/contacts/${a.contactId}`
  if (a.companyId) return `/companies/${a.companyId}`
  return '/dashboard'
}

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [notifications, setNotifications] = useState(() => load(LS_LIST, []))
  const knownEmails    = useRef(new Set(load(LS_EMAILS, null) || []))
  const firedMeetings  = useRef(new Set(load(LS_MTGS, null) || []))
  const knownOpens     = useRef(new Set(load(LS_OPENS, null) || []))
  const emailBaselined = useRef(load(LS_EMAILS, null) !== null) // first-ever run seeds silently
  const opensBaselined = useRef(load(LS_OPENS, null) !== null)  // first-ever run seeds silently

  // Persist list whenever it changes
  useEffect(() => { save(LS_LIST, notifications) }, [notifications])

  // Ask for desktop-notification permission once (harmless if denied/ignored)
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  const fireDesktop = useCallback((n) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    try {
      const dn = new Notification(n.title, { body: n.description, tag: n.id })
      dn.onclick = () => { window.focus(); navigate(n.link); markRead(n.id) }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  const poll = useCallback(async () => {
    if (!user) return
    let data
    try { ({ data } = await api.get('/notifications')) } catch { return }
    const meetings = data?.meetings || []
    const emails   = data?.emails   || []
    const opens    = data?.opens    || []
    const now = Date.now()
    const fresh = []

    // Meeting reminders — fire once, within the hour before start.
    for (const m of meetings) {
      if (!m.startTime) continue
      const start = new Date(m.startTime).getTime()
      const remindAt = start - HOUR_MS
      if (now >= remindAt && now < start && !firedMeetings.current.has(m.id)) {
        firedMeetings.current.add(m.id)
        const who = m.contact?.name || m.company?.name
        fresh.push({
          id: 'meeting_' + m.id,
          type: 'meeting',
          title: 'Upcoming meeting',
          description: `${m.title || 'Meeting'}${who ? ' with ' + who : ''} at ${new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          datetime: new Date().toISOString(),
          read: false,
          link: linkFor(m),
        })
      }
    }
    save(LS_MTGS, [...firedMeetings.current])

    // New inbound emails — baseline silently on first run so old mail doesn't spam.
    if (!emailBaselined.current) {
      emails.forEach(e => knownEmails.current.add(e.id))
      emailBaselined.current = true
    } else {
      for (const e of emails) {
        if (knownEmails.current.has(e.id)) continue
        knownEmails.current.add(e.id)
        const who = e.contact?.name || e.company?.name || e.fromEmail || 'a contact'
        fresh.push({
          id: 'email_' + e.id,
          type: 'email',
          title: 'New email received',
          description: `${e.subject || '(no subject)'} — from ${who}`,
          datetime: e.createdAt || new Date().toISOString(),
          read: false,
          link: linkFor(e),
        })
      }
    }
    save(LS_EMAILS, [...knownEmails.current])

    // Email opens — one alert per open event. Keyed by id+openCount so each new
    // open (the count increments) fires once. Baseline silently on first run.
    if (!opensBaselined.current) {
      opens.forEach(o => knownOpens.current.add(`${o.id}:${o.openCount}`))
      opensBaselined.current = true
    } else {
      for (const o of opens) {
        const key = `${o.id}:${o.openCount}`
        if (knownOpens.current.has(key)) continue
        knownOpens.current.add(key)
        const who = o.contact?.name || o.company?.name || o.toEmail || 'the recipient'
        const times = o.openCount > 1 ? ` (${o.openCount}×)` : ''
        fresh.push({
          id: `open_${o.id}_${o.openCount}`,
          type: 'email',
          title: 'Email opened',
          description: `${who} opened "${o.subject || '(no subject)'}"${times}`,
          datetime: o.lastOpenedAt || new Date().toISOString(),
          read: false,
          link: linkFor(o),
        })
      }
    }
    save(LS_OPENS, [...knownOpens.current])

    if (fresh.length) {
      setNotifications(prev => {
        const seen = new Set(prev.map(n => n.id))
        const add = fresh.filter(n => !seen.has(n.id))
        add.forEach(fireDesktop)
        return [...add, ...prev].slice(0, 100)
      })
    }
  }, [user, fireDesktop])

  // Poll on login + every minute
  useEffect(() => {
    if (!user) return
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [user, poll])

  // ── Actions ──
  const markRead     = useCallback((id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n)), [])
  const markAllRead  = useCallback(() => setNotifications(prev => prev.map(n => ({ ...n, read: true }))), [])
  const clearOne     = useCallback((id) => setNotifications(prev => prev.filter(n => n.id !== id)), [])
  const openNotification = useCallback((n) => { markRead(n.id); if (n.link) navigate(n.link) }, [markRead, navigate])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markRead, markAllRead, clearOne, openNotification }}>
      {children}
    </NotificationContext.Provider>
  )
}
