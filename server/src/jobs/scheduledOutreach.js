const axios = require('axios')
const jwt = require('jsonwebtoken')
const JWT_SECRET = require('../config/jwtSecret')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

let running = false

async function sweep() {
  if (running) return
  running = true
  try {
    const due = await prisma.scheduledOutreach.findMany({
      where: { status: 'Scheduled', scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
      include: { prospect: true },
    })
    for (const item of due) {
      const claimed = await prisma.scheduledOutreach.updateMany({ where: { id: item.id, status: 'Scheduled' }, data: { status: 'Processing' } })
      if (!claimed.count) continue
      try {
        const user = await prisma.user.findUnique({ where: { id: item.userId }, select: { id: true, name: true, email: true } })
        if (!user) throw new Error('Sending user no longer exists.')
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: '5m' })
        await axios.post(`http://127.0.0.1:${process.env.PORT || 5000}/api/email/send`, {
          to: item.toEmail, subject: item.subject, htmlBody: item.htmlBody, emailMode: 'new',
        }, { headers: { Authorization: `Bearer ${token}` }, timeout: 120000 })
        await prisma.$transaction([
          prisma.scheduledOutreach.update({ where: { id: item.id }, data: { status: 'Sent' } }),
          prisma.prospect.update({ where: { id: item.prospectId }, data: { status: 'Contacted', lastContacted: new Date() } }),
          prisma.prospectActivity.create({ data: { prospectId: item.prospectId, type: 'email', title: 'Scheduled email sent', detail: item.subject, createdBy: user.name || user.email } }),
        ])
      } catch (error) {
        const detail = error.response?.data?.message || error.message || 'Scheduled send failed.'
        await prisma.$transaction([
          prisma.scheduledOutreach.update({ where: { id: item.id }, data: { status: 'Failed' } }),
          prisma.prospectActivity.create({ data: { prospectId: item.prospectId, type: 'error', title: 'Scheduled email failed', detail } }),
        ])
      }
    }
  } catch (error) { console.error('[Scheduled Outreach]', error.message) }
  finally { running = false }
}

function startScheduledOutreachSweep() {
  sweep()
  const timer = setInterval(sweep, 30000)
  timer.unref?.()
  console.log('✓ Scheduled outreach sweep active')
}

module.exports = { startScheduledOutreachSweep }
