const router = require('express').Router()
const bcrypt = require('bcryptjs')
const { PrismaClient, Prisma } = require('@prisma/client')
const auth = require('../middleware/authMiddleware')

const prisma = new PrismaClient()

const DEFAULTS = {
  notifications: {
    taskReminders: true,
    overdueAlerts: true,
    dealUpdates: true,
    emailActivity: true,
    browserNotifications: false,
    dailyDigest: false,
  },
  security: { loginAlerts: true, sessionTimeout: '7d' },
  appearance: { theme: 'light', density: 'comfortable', accent: 'navy' },
  personalization: { coverImage: '', coverQuote: '' },
}

function normalizeSettings(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    notifications: { ...DEFAULTS.notifications, ...(value.notifications || {}) },
    security: { ...DEFAULTS.security, ...(value.security || {}) },
    appearance: { ...DEFAULTS.appearance, ...(value.appearance || {}) },
    personalization: { ...DEFAULTS.personalization, ...(value.personalization || {}) },
  }
}

router.get('/', auth, async (req, res) => {
  try {
    const [user, gmail] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, name: true, email: true, companyName: true, avatar: true, role: true, createdAt: true, passwordHash: true, settings: true },
      }),
      prisma.emailAccount.findFirst({ where: { userId: req.user.id, provider: 'gmail' }, select: { email: true, updatedAt: true } }),
    ])
    if (!user) return res.status(404).json({ message: 'Account not found.' })
    res.json({
      profile: { id: user.id, name: user.name, email: user.email, companyName: user.companyName || '', avatar: user.avatar, role: user.role, createdAt: user.createdAt },
      preferences: normalizeSettings(user.settings),
      security: { hasPassword: !!user.passwordHash },
      integrations: { gmail: { connected: !!gmail, email: gmail?.email || null, updatedAt: gmail?.updatedAt || null } },
    })
  } catch (err) {
    console.error('Settings fetch error:', err)
    res.status(500).json({ message: 'Unable to load settings.' })
  }
})

router.put('/profile', auth, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim()
    const email = String(req.body.email || '').trim().toLowerCase()
    const companyName = String(req.body.companyName || '').trim()
    if (name.length < 2) return res.status(400).json({ message: 'Name must contain at least 2 characters.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' })
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, email, companyName: companyName || null },
      select: { id: true, name: true, email: true, companyName: true, avatar: true, role: true },
    })
    res.json({ profile: user })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ message: 'That email address is already in use.' })
    }
    console.error('Profile update error:', err)
    res.status(500).json({ message: 'Unable to update profile.' })
  }
})

router.put('/preferences/:section', auth, async (req, res) => {
  try {
    const section = req.params.section
    if (!['notifications', 'security', 'appearance'].includes(section)) return res.status(400).json({ message: 'Unknown settings section.' })
    const current = await prisma.user.findUnique({ where: { id: req.user.id }, select: { settings: true } })
    const normalized = normalizeSettings(current?.settings)
    const incoming = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
    const next = { ...normalized, [section]: { ...normalized[section], ...incoming } }
    if (section === 'security' && !['1d', '7d', '30d'].includes(next.security.sessionTimeout)) next.security.sessionTimeout = '7d'
    if (section === 'appearance') {
      if (!['light', 'system'].includes(next.appearance.theme)) next.appearance.theme = 'light'
      if (!['comfortable', 'compact'].includes(next.appearance.density)) next.appearance.density = 'comfortable'
      if (!['navy', 'blue', 'red'].includes(next.appearance.accent)) next.appearance.accent = 'navy'
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { settings: next } })
    res.json({ preferences: next })
  } catch (err) {
    console.error('Preferences update error:', err)
    res.status(500).json({ message: 'Unable to save preferences.' })
  }
})

router.post('/change-password', auth, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '')
    const newPassword = String(req.body.newPassword || '')
    if (newPassword.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters.' })
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({ message: 'Use uppercase, lowercase and at least one number.' })
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { passwordHash: true } })
    if (!user) return res.status(404).json({ message: 'Account not found.' })
    if (user.passwordHash) {
      const valid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!valid) return res.status(400).json({ message: 'Current password is incorrect.' })
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } })
    res.json({ success: true, message: user.passwordHash ? 'Password updated successfully.' : 'Password created successfully.' })
  } catch (err) {
    console.error('Password update error:', err)
    res.status(500).json({ message: 'Unable to update password.' })
  }
})

module.exports = router
