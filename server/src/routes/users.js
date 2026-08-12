const router = require('express').Router()
const crypto = require('crypto')
const auth   = require('../middleware/authMiddleware')
const { PrismaClient, Prisma } = require('@prisma/client')
const prisma = new PrismaClient()

// Lead Owner management (Settings → Dropdown Lists) always reflects the
// live set of active users — computed on read directly from the User table
// (see getLeadOwnerOptions in server/src/routes/dropdowns.js), so there is
// no sync step needed here: activating/deactivating/deleting a user takes
// effect immediately with no extra bookkeeping.

// ── Helpers ──────────────────────────────────────────────────────────────
function genToken() {
  return crypto.randomBytes(32).toString('hex')
}

function inviteExpiry() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
}

// ── GET /api/users  — ACTIVE users only (for owner dropdowns) ────────────
router.get('/', auth, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    })
    res.json(users)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── GET /api/users/me/signature — the logged-in user's saved email signature ─
router.get('/me/signature', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { signature: true, signatureImage: true } })
    res.json({ signature: user?.signature || '', signatureImage: user?.signatureImage || '' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── PUT /api/users/me/signature — save the logged-in user's email signature ──
// signatureImage is a data-URI string (already compressed client-side) or ''/null to clear it.
router.put('/me/signature', auth, async (req, res) => {
  try {
    const { signature, signatureImage } = req.body
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        signature: signature || null,
        ...(signatureImage !== undefined ? { signatureImage: signatureImage || null } : {}),
      },
      select: { signature: true, signatureImage: true },
    })
    res.json({ signature: user.signature || '', signatureImage: user.signatureImage || '' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── GET /api/users/manage — all users for User Management page ───────────
router.get('/manage', auth, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, name: true, email: true, role: true,
        status: true, createdAt: true,
        inviteToken: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(users)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── POST /api/users/invite — create pending user + return invite link ────
router.post('/invite', auth, async (req, res) => {
  try {
    const { name, email, role = 'member' } = req.body
    if (!name || !email) return res.status(400).json({ message: 'Name and email are required.' })

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (existing) return res.status(409).json({ message: 'A user with this email already exists.' })

    const inviteToken   = genToken()
    const inviteExpires = inviteExpiry()

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role,
        status: 'pending',
        inviteToken,
        inviteExpires,
      },
    })

    const clientUrl  = process.env.CLIENT_URL || 'http://localhost:3000'
    const inviteLink = `${clientUrl}/accept-invite?token=${inviteToken}`

    // Optional email sending — silent if SMTP not configured
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
          subject: 'You have been invited to NXT Sales',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
              <h2 style="color:#0f172a">You're invited to NXT Sales</h2>
              <p>Hi ${user.name},</p>
              <p>You have been invited to join <strong>NXT Sales</strong>. Click the button below to set your password and activate your account.</p>
              <a href="${inviteLink}" style="display:inline-block;background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Accept Invitation</a>
              <p style="color:#64748b;font-size:12px">This link expires in 7 days. If you didn't expect this invitation, you can ignore this email.</p>
            </div>
          `,
        })
        emailSent = true
      } catch (mailErr) {
        console.error('Invite email failed:', mailErr.message)
      }
    }

    res.json({
      success: true,
      inviteLink,
      emailSent,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── PATCH /api/users/:id/status — activate / deactivate ─────────────────
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body
    if (!['active', 'deactivated'].includes(status)) {
      return res.status(400).json({ message: 'status must be active or deactivated.' })
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
      select: { id: true, name: true, email: true, role: true, status: true },
    })
    res.json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── PATCH /api/users/:id/role ────────────────────────────────────────────
router.patch('/:id/role', auth, async (req, res) => {
  try {
    const { role } = req.body
    if (!['member', 'admin', 'super_admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role.' })
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true, status: true },
    })
    res.json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── POST /api/users/:id/resend-invite ────────────────────────────────────
router.post('/:id/resend-invite', auth, async (req, res) => {
  try {
    const inviteToken   = genToken()
    const inviteExpires = inviteExpiry()

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { inviteToken, inviteExpires, status: 'pending' },
      select: { id: true, name: true, email: true },
    })

    const clientUrl  = process.env.CLIENT_URL || 'http://localhost:3000'
    const inviteLink = `${clientUrl}/accept-invite?token=${inviteToken}`

    res.json({ inviteLink, emailSent: false, user })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── DELETE /api/users/:id ────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: 'You cannot delete your own account.' })
    }
    await prisma.user.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    // A user who has ever created an Activity (note/call/email/meeting/task)
    // or owns a Deal can't be hard-deleted — those are required (non-null)
    // relations, so Postgres blocks the delete with a foreign key
    // constraint instead of silently orphaning that history. That's the
    // database correctly protecting real data, not a bug — the fix is
    // surfacing WHY instead of a bare "Server error", and pointing at
    // Deactivate (PATCH /:id/status, already used by the Deactivated Users
    // tab), which removes the user's access without touching any of their
    // historical data.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return res.status(400).json({
        message: "This user can't be deleted — they have existing activity records (emails, notes, calls, tasks, or meetings) and/or own deals. Deactivate the user instead to remove their access while keeping their history intact.",
      })
    }
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
