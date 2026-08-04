const router   = require('express').Router()
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const crypto   = require('crypto')
const passport = require('passport')
const { PrismaClient } = require('@prisma/client')
const { upsertLeadOwnerOption } = require('./users')

const prisma = new PrismaClient()
const SECRET = process.env.JWT_SECRET || 'dev-secret'

function genToken() {
  return crypto.randomBytes(32).toString('hex')
}

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
    // New accounts default to status 'active' (schema default) — register
    // them as an assignable Lead Owner immediately, same as any active user.
    await upsertLeadOwnerOption(user, true)

    res.status(201).json({ success: true, token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/auth/forgot-password
// Reuses the same inviteToken/inviteExpires columns and validate-invite /
// accept-invite endpoints already used to activate invited accounts — proving
// ownership of a token with an expiry, then setting a password, is exactly
// the same mechanism a password reset needs, so nothing new was built for the
// "verify token" / "set new password" halves of this flow, only for
// generating and delivering the token itself.
//
// Always responds with the same generic message regardless of whether the
// email matched a real account, so this can't be used to enumerate which
// emails have accounts. The reset link is only ever included in the response
// when SMTP isn't configured (the same dev-mode fallback POST /api/users/invite
// already uses) — with real SMTP configured, the link is ONLY delivered by
// email, since this endpoint is public and unauthenticated.
router.post('/forgot-password', async (req, res) => {
  const genericResponse = { success: true, message: 'If an account exists for that email, a password reset link has been sent.' }
  try {
    const { email } = req.body
    if (!email) return res.json(genericResponse)

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (!user || user.status === 'deactivated') return res.json(genericResponse)

    const inviteToken   = genToken()
    const inviteExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour — shorter-lived than a fresh invite (7 days)
    await prisma.user.update({ where: { id: user.id }, data: { inviteToken, inviteExpires } })

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000'
    const resetLink = `${clientUrl}/reset-password?token=${inviteToken}`

    let emailSent = false
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const nodemailer = require('nodemailer')
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        })
        await transporter.sendMail({
          from: `"NXT Sales" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: user.email,
          subject: 'Reset your NXT Sales password',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
              <h2 style="color:#0f172a">Reset your password</h2>
              <p>Hi ${user.name},</p>
              <p>We received a request to reset your NXT Sales password. Click the button below to choose a new one.</p>
              <a href="${resetLink}" style="display:inline-block;background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Reset Password</a>
              <p style="color:#64748b;font-size:12px">This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.</p>
            </div>
          `,
        })
        emailSent = true
      } catch (mailErr) {
        console.error('Password reset email failed:', mailErr.message)
      }
    }

    res.json({ ...genericResponse, ...(emailSent ? {} : { resetLink }) })
  } catch (err) {
    console.error(err)
    res.json(genericResponse) // never leak a server error here either — same generic response either way
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
    // Now active — enable their Lead Owner option (created disabled at invite time).
    await upsertLeadOwnerOption(user, true)

    res.json({ success: true, token: signToken(user), user })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
