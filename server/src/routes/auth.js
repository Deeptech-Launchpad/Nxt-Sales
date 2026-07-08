const router   = require('express').Router()
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const passport = require('passport')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const SECRET = process.env.JWT_SECRET || 'dev-secret'

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, SECRET, { expiresIn: '7d' })
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' })

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) return res.status(401).json({ message: 'Invalid email or password.' })
    if (user.status === 'deactivated') return res.status(401).json({ message: 'Your account has been deactivated. Please contact your administrator.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ message: 'Invalid email or password.' })

    res.json({ success: true, token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) return res.status(400).json({ message: 'All fields are required.' })

    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) return res.status(409).json({ message: 'Email already in use.' })

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({ data: { name, email, passwordHash } })

    res.status(201).json({ success: true, token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

// GET /auth/google/callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=google' }),
  (req, res) => {
    const token = signToken(req.user)
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({ id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role }))}`)
  }
)

// GET /api/auth/me
router.get('/me', require('../middleware/authMiddleware'), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id:true, name:true, email:true, role:true, avatar:true, status:true, createdAt:true } })
  res.json(user)
})

// GET /api/auth/validate-invite?token=xxx
router.get('/validate-invite', async (req, res) => {
  try {
    const { token } = req.query
    if (!token) return res.status(400).json({ message: 'Token required.' })

    const user = await prisma.user.findFirst({
      where: { inviteToken: token, inviteExpires: { gt: new Date() } },
      select: { id: true, name: true, email: true, role: true },
    })
    if (!user) return res.status(400).json({ message: 'This invite link is invalid or has expired.' })

    res.json({ user })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/auth/accept-invite — set password & activate account
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, password } = req.body
    if (!token || !password) return res.status(400).json({ message: 'Token and password are required.' })
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' })

    const existing = await prisma.user.findFirst({
      where: { inviteToken: token, inviteExpires: { gt: new Date() } },
    })
    if (!existing) return res.status(400).json({ message: 'This invite link is invalid or has expired.' })

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, status: 'active', inviteToken: null, inviteExpires: null },
      select: { id: true, name: true, email: true, role: true, avatar: true },
    })

    res.json({ success: true, token: signToken(user), user })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
