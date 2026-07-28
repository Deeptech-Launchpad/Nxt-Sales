const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const USER_SELECT = { id: true, name: true, email: true, avatar: true }

// GET /api/chat/users — all users except self (teammate list, member picker for Create Group)
router.get('/users', auth, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where:   { id: { not: req.user.id } },
      select:  USER_SELECT,
      orderBy: { name: 'asc' },
    })
    res.json(users)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// Finds an existing 2-member, non-group conversation between exactly these
// two users, or creates one. A 1:1 chat is just a 2-member group under the
// hood — no separate code path for "1:1" vs "group" beyond this lookup.
async function findOrCreate1on1(selfId, otherId) {
  const mine   = await prisma.conversationMember.findMany({ where: { userId: selfId },  select: { conversationId: true } })
  const theirs = await prisma.conversationMember.findMany({ where: { userId: otherId }, select: { conversationId: true } })
  const theirIds = new Set(theirs.map(m => m.conversationId))
  const sharedIds = mine.map(m => m.conversationId).filter(id => theirIds.has(id))

  for (const id of sharedIds) {
    const conv = await prisma.conversation.findUnique({ where: { id }, include: { members: true } })
    if (conv && !conv.isGroup && conv.members.length === 2) return conv
  }

  return prisma.conversation.create({
    data: {
      isGroup: false,
      createdById: selfId,
      members: { create: [{ userId: selfId }, { userId: otherId }] },
    },
    include: { members: true },
  })
}

// GET /api/chat/conversations — every conversation the user belongs to,
// sorted by most recent activity, with a last-message preview and an
// unread count derived from this member's own read cursor.
router.get('/conversations', auth, async (req, res) => {
  try {
    const memberships = await prisma.conversationMember.findMany({
      where: { userId: req.user.id },
      include: {
        conversation: {
          include: { members: { include: { user: { select: USER_SELECT } } } },
        },
      },
    })

    const myLastReadByConv = new Map(memberships.map(m => [m.conversationId, m.lastReadAt]))
    const convs = memberships.map(m => m.conversation)

    const lastMessageIds = convs.map(c => c.lastMessageId).filter(Boolean)
    const lastMessages = lastMessageIds.length
      ? await prisma.chatMessage.findMany({
          where: { id: { in: lastMessageIds } },
          select: { id: true, body: true, fromUserId: true, deletedAt: true },
        })
      : []
    const lastMessageById = new Map(lastMessages.map(m => [m.id, m]))

    const results = await Promise.all(convs.map(async (c) => {
      const lastReadAt = myLastReadByConv.get(c.id)
      const unreadCount = await prisma.chatMessage.count({
        where: {
          conversationId: c.id,
          fromUserId: { not: req.user.id },
          ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
        },
      })
      const lastMsg = c.lastMessageId ? lastMessageById.get(c.lastMessageId) : null

      return {
        id: c.id,
        isGroup: c.isGroup,
        name: c.name,
        // "members" excludes the caller — for a 1:1 this is exactly the other
        // person; for a group it's everyone else, both are what the UI needs.
        members: c.members.filter(m => m.userId !== req.user.id).map(m => m.user),
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: lastMsg ? (lastMsg.deletedAt ? 'Message deleted' : lastMsg.body) : null,
        lastMessageFromSelf: lastMsg ? lastMsg.fromUserId === req.user.id : false,
        unreadCount,
      }
    }))

    results.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0))
    res.json(results)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/chat/conversations — start a 1:1 ({userId}) or create a group
// ({name, memberIds}).
router.post('/conversations', auth, async (req, res) => {
  try {
    const { userId, name, memberIds } = req.body

    if (userId) {
      if (userId === req.user.id) return res.status(400).json({ message: 'Cannot start a conversation with yourself.' })
      const conv = await findOrCreate1on1(req.user.id, userId)
      return res.status(201).json({ id: conv.id })
    }

    if (name && Array.isArray(memberIds)) {
      const uniqueMemberIds = [...new Set([req.user.id, ...memberIds])]
      if (uniqueMemberIds.length < 3) {
        return res.status(400).json({ message: 'A group needs at least 2 other members.' })
      }
      const conv = await prisma.conversation.create({
        data: {
          isGroup: true,
          name: name.trim(),
          createdById: req.user.id,
          members: { create: uniqueMemberIds.map(id => ({ userId: id })) },
        },
      })
      return res.status(201).json({ id: conv.id })
    }

    res.status(400).json({ message: 'Provide either userId (1:1) or name + memberIds (group).' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

async function requireMembership(conversationId, userId) {
  return prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  })
}

const REPLY_TO_INCLUDE = { include: { fromUser: { select: { id: true, name: true } } } }
const MENTIONS_INCLUDE = { include: { user: { select: { id: true, name: true } } } }

// Deleted messages are redacted at the API boundary, not just hidden client-
// side — the real body stays in the DB (soft-delete, an audit trail), but no
// read endpoint ever sends it back out once deletedAt is set.
function redact(msg) {
  if (!msg) return msg
  if (msg.deletedAt) msg.body = 'This message was deleted'
  if (msg.replyTo?.deletedAt) msg.replyTo.body = 'This message was deleted'
  return msg
}

// GET /api/chat/conversations/:id/messages — optional ?after= cursor, same as before.
router.get('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const { id } = req.params
    const { after } = req.query

    if (!(await requireMembership(id, req.user.id))) {
      return res.status(403).json({ message: 'Not a member of this conversation.' })
    }

    const where = { conversationId: id }
    if (after) where.createdAt = { gt: new Date(after) }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: after ? 200 : 300,
      include: { fromUser: { select: USER_SELECT }, replyTo: REPLY_TO_INCLUDE, mentions: MENTIONS_INCLUDE },
    })
    res.json(messages.map(redact))
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/chat/conversations/:id/messages — send a message. Optional
// replyToId (must belong to the same conversation) and mentionedUserIds
// (from the composer's @mention autocomplete — never parsed from free text,
// so there's no ambiguous-name guessing).
router.post('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const { id } = req.params
    const { body, replyToId, mentionedUserIds } = req.body
    if (!body?.trim()) return res.status(400).json({ message: 'body is required.' })

    if (!(await requireMembership(id, req.user.id))) {
      return res.status(403).json({ message: 'Not a member of this conversation.' })
    }

    const conv = await prisma.conversation.findUnique({ where: { id }, include: { members: true } })
    // toUserId only means something for a 1:1 — kept populated there for any
    // code that still reads it during the transition; null for group sends.
    const otherMember = !conv.isGroup ? conv.members.find(m => m.userId !== req.user.id) : null

    let validReplyToId = null
    if (replyToId) {
      const target = await prisma.chatMessage.findUnique({ where: { id: replyToId } })
      if (target && target.conversationId === id) validReplyToId = replyToId
    }

    // Only real, current members can be recorded as mentioned — a client
    // can't mention someone outside the conversation.
    const memberIds = new Set(conv.members.map(m => m.userId))
    const validMentionIds = Array.isArray(mentionedUserIds)
      ? [...new Set(mentionedUserIds)].filter(uid => memberIds.has(uid) && uid !== req.user.id)
      : []

    const message = await prisma.chatMessage.create({
      data: {
        conversationId: id,
        fromUserId: req.user.id,
        toUserId: otherMember ? otherMember.userId : null,
        body: body.trim(),
        replyToId: validReplyToId,
        ...(validMentionIds.length ? { mentions: { create: validMentionIds.map(userId => ({ userId })) } } : {}),
      },
      include: { fromUser: { select: USER_SELECT }, replyTo: REPLY_TO_INCLUDE, mentions: MENTIONS_INCLUDE },
    })

    await Promise.all([
      prisma.conversation.update({ where: { id }, data: { lastMessageAt: message.createdAt, lastMessageId: message.id } }),
      // Sending implies you've read up to this point yourself.
      prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId: id, userId: req.user.id } },
        data: { lastReadAt: message.createdAt },
      }),
    ])

    res.status(201).json(redact(message))
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// PATCH /api/chat/conversations/:id/messages/:messageId — edit (author-only).
router.patch('/conversations/:id/messages/:messageId', auth, async (req, res) => {
  try {
    const { id, messageId } = req.params
    const { body } = req.body
    if (!body?.trim()) return res.status(400).json({ message: 'body is required.' })

    const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } })
    if (!existing || existing.conversationId !== id) return res.status(404).json({ message: 'Message not found.' })
    if (existing.fromUserId !== req.user.id) return res.status(403).json({ message: 'You can only edit your own messages.' })
    if (existing.deletedAt) return res.status(400).json({ message: 'Cannot edit a deleted message.' })

    const message = await prisma.chatMessage.update({
      where: { id: messageId },
      data: { body: body.trim(), editedAt: new Date() },
      include: { fromUser: { select: USER_SELECT }, replyTo: REPLY_TO_INCLUDE, mentions: MENTIONS_INCLUDE },
    })
    res.json(redact(message))
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// DELETE /api/chat/conversations/:id/messages/:messageId — soft delete
// (author-only). The row and its real body stay in the DB; every read
// endpoint redacts it via redact() above.
router.delete('/conversations/:id/messages/:messageId', auth, async (req, res) => {
  try {
    const { id, messageId } = req.params
    const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } })
    if (!existing || existing.conversationId !== id) return res.status(404).json({ message: 'Message not found.' })
    if (existing.fromUserId !== req.user.id) return res.status(403).json({ message: 'You can only delete your own messages.' })

    await prisma.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() } })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// PATCH /api/chat/conversations/:id/messages/:messageId/pin — any member may
// pin/unpin, same as a shared conversation-level annotation.
router.patch('/conversations/:id/messages/:messageId/pin', auth, async (req, res) => {
  try {
    const { id, messageId } = req.params
    if (!(await requireMembership(id, req.user.id))) {
      return res.status(403).json({ message: 'Not a member of this conversation.' })
    }
    const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } })
    if (!existing || existing.conversationId !== id) return res.status(404).json({ message: 'Message not found.' })

    const message = await prisma.chatMessage.update({
      where: { id: messageId },
      data: { pinnedAt: existing.pinnedAt ? null : new Date() },
      include: { fromUser: { select: USER_SELECT } },
    })
    res.json(message)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/chat/conversations/:id/pinned — pinned-messages panel.
router.get('/conversations/:id/pinned', auth, async (req, res) => {
  try {
    const { id } = req.params
    if (!(await requireMembership(id, req.user.id))) {
      return res.status(403).json({ message: 'Not a member of this conversation.' })
    }
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: id, pinnedAt: { not: null } },
      orderBy: { pinnedAt: 'desc' },
      include: { fromUser: { select: USER_SELECT } },
    })
    res.json(messages.map(redact))
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// PUT /api/chat/conversations/:id/read — advance this member's read cursor to now.
router.put('/conversations/:id/read', auth, async (req, res) => {
  try {
    const { id } = req.params
    if (!(await requireMembership(id, req.user.id))) {
      return res.status(403).json({ message: 'Not a member of this conversation.' })
    }
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: req.user.id } },
      data: { lastReadAt: new Date() },
    })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/chat/unread — total unread across every conversation, for the nav
// badge (Sidebar.jsx). Same response shape as before the E3 rewrite.
router.get('/unread', auth, async (req, res) => {
  try {
    const memberships = await prisma.conversationMember.findMany({
      where: { userId: req.user.id },
      select: { conversationId: true, lastReadAt: true },
    })
    const counts = await Promise.all(memberships.map(m => prisma.chatMessage.count({
      where: {
        conversationId: m.conversationId,
        fromUserId: { not: req.user.id },
        ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
      },
    })))
    res.json({ count: counts.reduce((a, b) => a + b, 0) })
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
