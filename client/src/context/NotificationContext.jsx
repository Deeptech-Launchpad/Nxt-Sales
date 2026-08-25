import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import api from '../api/client'
import { getSocket } from '../socket'

const NotificationContext = createContext(null)
export const useNotifications = () => useContext(NotificationContext)

// localStorage keys — read/cleared state lives client-side (no DB schema change).
const LS_LIST   = 'mwz_notifications'          // the notification list (with read flags)
const LS_EMAILS = 'mwz_notif_known_emails'     // inbound email ids already accounted for
const LS_MTGS   = 'mwz_notif_fired_meetings'   // meeting ids already reminded
const LS_OPENS  = 'mwz_notif_known_opens'      // sent-email open events already alerted
const LS_TASKS  = 'mwz_notif_fired_tasks'      // "due_<id>"/"overdue_<id>" reminders already fired
const POLL_MS   = 60_000
const HOUR_MS   = 60 * 60 * 1000
const DEFAULT_PREFS = { taskReminders: true, overdueAlerts: true, dealUpdates: true, emailActivity: true, browserNotifications: false, dailyDigest: false }

const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback } catch { return fallback } }
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore quota */ } }

function linkFor(a) {
  if (a.companyId) return `/companies/${a.companyId}`
  return '/dashboard'
}

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [preferences, setPreferences] = useState(() => ({ ...DEFAULT_PREFS, ...load('nxt_notification_preferences', {}) }))

  const [notifications, setNotifications] = useState(() => load(LS_LIST, []))
  const knownEmails    = useRef(new Set(load(LS_EMAILS, null) || []))
  const firedMeetings  = useRef(new Set(load(LS_MTGS, null) || []))
  const knownOpens     = useRef(new Set(load(LS_OPENS, null) || []))
  const firedTasks     = useRef(new Set(load(LS_TASKS, null) || []))
  const emailBaselined = useRef(load(LS_EMAILS, null) !== null) // first-ever run seeds silently
  const opensBaselined = useRef(load(LS_OPENS, null) !== null)  // first-ever run seeds silently

  // Persist list whenever it changes
  useEffect(() => { save(LS_LIST, notifications) }, [notifications])

  // Load server-backed preferences and keep them in sync with the Settings page.
  useEffect(() => {
    if (!user) return
    api.get('/settings').then(({ data }) => {
      const next = { ...DEFAULT_PREFS, ...(data?.preferences?.notifications || {}) }
      setPreferences(next)
      save('nxt_notification_preferences', next)
    }).catch(() => {})
    const sync = event => setPreferences({ ...DEFAULT_PREFS, ...(event.detail || {}) })
    window.addEventListener('nxt-notification-preferences', sync)
    return () => window.removeEventListener('nxt-notification-preferences', sync)
  }, [user])

  useEffect(() => {
    if (preferences.browserNotifications && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [preferences.browserNotifications])

  const fireDesktop = useCallback((n) => {
    if (!preferences.browserNotifications) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    try {
      const dn = new Notification(n.title, { body: n.description, tag: n.id })
      dn.onclick = () => { window.focus(); navigate(n.link); markRead(n.id) }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, preferences.browserNotifications])

  const poll = useCallback(async () => {
    if (!user) return
    let data
    try { ({ data } = await api.get('/notifications')) } catch { return }
    const meetings = data?.meetings || []
    const emails   = data?.emails   || []
    const opens    = data?.opens    || []
    const tasks    = data?.tasks    || []
    const now = Date.now()
    const fresh = []

    // Meeting reminders — fire once, within the hour before start.
    for (const m of meetings) {
      if (!m.startTime) continue
      const start = new Date(m.startTime).getTime()
      const remindAt = start - HOUR_MS
      if (now >= remindAt && now < start && !firedMeetings.current.has(m.id)) {
        firedMeetings.current.add(m.id)
        const who = m.company?.name
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

    // Task reminders — assigned-to-you tasks only. Two independent one-time
    // fires per task, mirroring the meeting reminder's once-only pattern:
    // "due soon" within the hour before dueDate, and "overdue" once it's
    // passed and still not completed. GET /notifications already scopes the
    // window to +/-24h, so this never has to scan far-future/ancient tasks.
    for (const t of tasks) {
      if (!t.dueDate) continue
      const due = new Date(t.dueDate).getTime()
      const who = t.company?.name
      if (now < due) {
        const remindAt = due - HOUR_MS
        const key = 'due_' + t.id
        if (preferences.taskReminders && now >= remindAt && !firedTasks.current.has(key)) {
          firedTasks.current.add(key)
          fresh.push({
            id: 'task_' + key,
            type: 'task',
            title: 'Task due soon',
            description: `${t.title || 'Task'}${who ? ' — ' + who : ''} due at ${new Date(t.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            datetime: new Date().toISOString(),
            read: false,
            link: linkFor(t),
          })
        }
      } else {
        const key = 'overdue_' + t.id
        if (preferences.overdueAlerts && !firedTasks.current.has(key)) {
          firedTasks.current.add(key)
          fresh.push({
            id: 'task_' + key,
            type: 'task',
            title: 'Task overdue',
            description: `${t.title || 'Task'}${who ? ' — ' + who : ''} was due ${new Date(t.dueDate).toLocaleDateString()}`,
            datetime: new Date().toISOString(),
            read: false,
            link: linkFor(t),
          })
        }
      }
    }
    save(LS_TASKS, [...firedTasks.current])

    // New inbound emails — baseline silently on first run so old mail doesn't spam.
    if (!preferences.emailActivity) {
      emails.forEach(e => knownEmails.current.add(e.id))
    } else if (!emailBaselined.current) {
      emails.forEach(e => knownEmails.current.add(e.id))
      emailBaselined.current = true
    } else {
      for (const e of emails) {
        if (knownEmails.current.has(e.id)) continue
        knownEmails.current.add(e.id)
        const who = e.company?.name || e.fromEmail || 'a contact'
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
    if (!preferences.emailActivity) {
      opens.forEach(o => knownOpens.current.add(`${o.id}:${o.openCount}`))
    } else if (!opensBaselined.current) {
      opens.forEach(o => knownOpens.current.add(`${o.id}:${o.openCount}`))
      opensBaselined.current = true
    } else {
      for (const o of opens) {
        const key = `${o.id}:${o.openCount}`
        if (knownOpens.current.has(key)) continue
        knownOpens.current.add(key)
        const who = o.company?.name || o.toEmail || 'the recipient'
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
  }, [user, fireDesktop, preferences.taskReminders, preferences.overdueAlerts, preferences.emailActivity])

  // Poll on login + every minute
  useEffect(() => {
    if (!user) return
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [user, poll])

  // Team Chat desktop/in-app notifications (Update 3 / E6) — event-driven via
  // the shared socket instead of polling, since Chat already maintains this
  // connection (Update 3 / E1). Mounted app-wide (this provider wraps the
  // whole Layout) so a message notifies even while viewing a different page.
  useEffect(() => {
    if (!user) return
    const socket = getSocket()
    if (!socket.connected) socket.connect()

    const onNewMessage = ({ conversationId, message }) => {
      if (message.fromUserId === user.id) return // never notify for your own sent messages
      const n = {
        id: `chat_${message.id}`,
        type: 'chat',
        title: `New message from ${message.fromUser?.name || 'a teammate'}`,
        description: message.body || (message.attachments?.length ? 'Sent an attachment' : ''),
        datetime: message.createdAt,
        read: false,
        link: '/chat',
      }
      setNotifications(prev => {
        if (prev.some(p => p.id === n.id)) return prev
        fireDesktop(n)
        return [n, ...prev].slice(0, 100)
      })
    }

    socket.on('chat:new-message', onNewMessage)
    return () => socket.off('chat:new-message', onNewMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, fireDesktop])

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
