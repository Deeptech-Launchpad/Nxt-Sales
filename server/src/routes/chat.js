const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// GET /api/chat/users — all users except self (for chat list)
router.get('/users', auth, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where:   { id: { not: req.user.id } },
      select:  { id: true, name: true, email: true, avatar: true },
      orderBy: { name: 'asc' },
    })
    res.json(users)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/chat/messages/:userId — conversation with a specific user
// Optional query: ?after=ISO_TIMESTAMP  (only return messages newer than this)
router.get('/messages/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params
    const { after }  = req.query

    const where = {
      OR: [
        { fromUserId: req.user.id, toUserId: userId },
        { fromUserId: userId,      toUserId: req.user.id },
      ],
    }
    if (after) where.createdAt = { gt: new Date(after) }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take:    after ? 200 : 300,
      include: { fromUser: { select: { id: true, name: true, avatar: true } } },
    })

    res.json(messages)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/chat/messages — send a message
router.post('/messages', auth, async (req, res) => {
  try {
    const { toUserId, body } = req.body
    if (!toUserId || !body?.trim()) {
      return res.status(400).json({ message: 'toUserId and body are required.' })
    }

    const message = await prisma.chatMessage.create({
      data: {
        fromUserId: req.user.id,
        toUserId,
        body: body.trim(),
      },
      include: { fromUser: { select: { id: true, name: true, avatar: true } } },
    })

    res.status(201).json(message)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// PUT /api/chat/read/:userId — mark all messages from userId to current user as read
router.put('/read/:userId', auth, async (req, res) => {
  try {
    await prisma.chatMessage.updateMany({
      where: { fromUserId: req.params.userId, toUserId: req.user.id, isRead: false },
      data:  { isRead: true },
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/chat/unread — total unread count for current user
router.get('/unread', auth, async (req, res) => {
  try {
    const count = await prisma.chatMessage.count({
      where: { toUserId: req.user.id, isRead: false },
    })
    res.json({ count })
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
