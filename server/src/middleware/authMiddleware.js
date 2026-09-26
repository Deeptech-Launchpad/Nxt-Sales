const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const JWT_SECRET = require('../config/jwtSecret')

const prisma = new PrismaClient()

// The JWT only proves who signed in up to 7 days ago. Status and role are
// re-read from the database on every request so that deactivating a user cuts
// off their existing session immediately (not just their next login), and a
// role change takes effect without waiting for the token to expire. Only
// User.status / User.role are read — nothing about the user's CRM data is
// touched. The app has exactly two roles, Admin and Member; a legacy
// 'super_admin' row is treated as Admin.
module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  let payload
  try {
    payload = jwt.verify(header.split(' ')[1], JWT_SECRET)
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
  try {
    const current = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { status: true, role: true },
    })
    if (!current || current.status === 'deactivated') {
      return res.status(401).json({ message: 'Your account has been deactivated. Please contact your administrator.' })
    }
    req.user = { ...payload, role: current.role === 'super_admin' ? 'admin' : current.role }
    next()
  } catch (err) {
    console.error('[auth] user lookup failed:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
}
