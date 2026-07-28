const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const multer = require('multer')
const path   = require('path')
const fs     = require('fs')
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')
const { getIO, getOnlineSocketIds, isUserOnline } = require('../realtime/socket')

const prisma = new PrismaClient()

const USER_SELECT = { id: true, name: true, email: true, avatar: true }

// ── File sharing (E5) ─────────────────────────────────────────────────────
// Local disk storage — no cloud storage account exists anywhere in this
// deployment, and standing one up isn't a call to make unilaterally (see
// docs/PROJECT_DOCUMENTATION.md). Never allowed regardless of declared mime
// type, since a client can lie about that: executables/scripts. Everything
// else is allowed as a generic "other" attachment, sized-capped.
const UPLOAD_DIR = path.join(__dirname, '../../uploads/chat')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const BLOCKED_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.sh', '.msi', '.dll', '.com', '.scr', '.ps1', '.vbs', '.jse', '.wsf', '.jar', '.app', '.msc'])
const MAX_UPLOAD_BYTES = (Number(process.env.CHAT_UPLOAD_MAX_MB) || 25) * 1024 * 1024

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (BLOCKED_EXTENSIONS.has(ext)) return cb(new Error(`File type "${ext}" is not allowed.`))
    cb(null, true)
  },
})

// POST /api/chat/upload — uploads a file, returns metadata to attach to a
// message (a separate step from sending — keeps POST .../messages a plain
// JSON endpoint for text + replies + mentions + attachment references alike).
router.post('/upload', auth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit.`
        : (err.message || 'Upload failed.')
      return res.status(status).json({ message })
    }
    if (!req.file) return res.status(400).json({ message: 'No file provided.' })
    res.status(201).json({
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: `/uploads/chat/${req.file.filename}`,
    })
  })
})

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

// Attaches a Sent/Delivered/Read rollup to every message the requester
// authored (E6) — meaningless for messages from someone else, so those are
// left alone. "Read" requires every OTHER member to have read it; "Delivered"
// requires every other member to have at least a delivered receipt.
async function attachReceiptSummaries(messages, selfId, conversationMemberCount) {
  const ownMessageIds = messages.filter(m => m.fromUserId === selfId).map(m => m.id)
  if (!ownMessageIds.length) return messages

  const receipts = await prisma.chatMessageReceipt.findMany({ where: { messageId: { in: ownMessageIds } } })
  const byMessage = new Map()
  for (const r of receipts) {
    if (!byMessage.has(r.messageId)) byMessage.set(r.messageId, [])
    byMessage.get(r.messageId).push(r)
  }
  const totalRecipients = Math.max(conversationMemberCount - 1, 0)

  return messages.map(m => {
    if (m.fromUserId !== selfId) return m
    const rs = byMessage.get(m.id) || []
    const readCount = rs.filter(r => r.readAt).length
    const deliveredCount = rs.filter(r => r.deliveredAt).length
    const status = totalRecipients > 0 && readCount >= totalRecipients ? 'read'
      : totalRecipients > 0 && deliveredCount >= totalRecipients ? 'delivered'
      : 'sent'
    return { ...m, receiptStatus: status }
  })
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

    const [messages, memberCount] = await Promise.all([
      prisma.chatMessage.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: after ? 200 : 300,
        include: { fromUser: { select: USER_SELECT }, replyTo: REPLY_TO_INCLUDE, mentions: MENTIONS_INCLUDE },
      }),
      prisma.conversationMember.count({ where: { conversationId: id } }),
    ])
    const withReceipts = await attachReceiptSummaries(messages, req.user.id, memberCount)
    res.json(withReceipts.map(redact))
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// A CRM record attached to a message is a {type, id, label} snapshot, not a
// live foreign key (no polymorphic FK across Company/Deal) — validated once
// here so a message never carries a reference to something that never
// existed, but never a live join afterward.
async function validateAttachedRecord(attachedRecord) {
  if (!attachedRecord || typeof attachedRecord !== 'object') return null
  const { type, id, label } = attachedRecord
  if (type === 'company') {
    const row = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true, deletedAt: true } })
    if (!row || row.deletedAt) return null
    return { type: 'company', id: row.id, label: label || row.name }
  }
  if (type === 'deal') {
    const row = await prisma.deal.findUnique({ where: { id }, select: { id: true, title: true } })
    if (!row) return null
    return { type: 'deal', id: row.id, label: label || row.title }
  }
  return null
}

// POST /api/chat/conversations/:id/messages — send a message. Optional
// replyToId (must belong to the same conversation), mentionedUserIds (from
// the composer's @mention autocomplete — never parsed from free text),
// attachments ([{filename, mimeType, size, url}] from POST /chat/upload),
// and attachedRecord ({type, id, label} — a Company or Deal reference).
router.post('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const { id } = req.params
    const { body, replyToId, mentionedUserIds, attachments, attachedRecord } = req.body
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0
    if (!body?.trim() && !hasAttachments) return res.status(400).json({ message: 'body or attachments required.' })

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

    const validAttachedRecord = await validateAttachedRecord(attachedRecord)

    const message = await prisma.chatMessage.create({
      data: {
        conversationId: id,
        fromUserId: req.user.id,
        toUserId: otherMember ? otherMember.userId : null,
        body: (body || '').trim(),
        replyToId: validReplyToId,
        attachments: hasAttachments ? attachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, size: a.size, url: a.url })) : undefined,
        attachedRecord: validAttachedRecord || undefined,
        ...(validMentionIds.length ? { mentions: { create: validMentionIds.map(userId => ({ userId })) } } : {}),
      },
      include: { fromUser: { select: USER_SELECT }, replyTo: REPLY_TO_INCLUDE, mentions: MENTIONS_INCLUDE },
    })

    const otherMemberIds = conv.members.map(m => m.userId).filter(uid => uid !== req.user.id)

    await Promise.all([
      prisma.conversation.update({ where: { id }, data: { lastMessageAt: message.createdAt, lastMessageId: message.id } }),
      // Sending implies you've read up to this point yourself.
      prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId: id, userId: req.user.id } },
        data: { lastReadAt: message.createdAt },
      }),
      // Read receipts (E6): one row per OTHER member. "Delivered" only means
      // actually pushed to a live socket right now — a member who's offline
      // stays undelivered until they open the app and mark it read, which is
      // still tracked correctly via readAt regardless.
      ...(otherMemberIds.length ? [prisma.chatMessageReceipt.createMany({
        data: otherMemberIds.map(userId => ({
          messageId: message.id,
          userId,
          deliveredAt: isUserOnline(userId) ? new Date() : null,
        })),
        skipDuplicates: true,
      })] : []),
    ])

    // Push the new message + a desktop-notification trigger to every other
    // member currently online — same event covers both (E6).
    const io = getIO()
    if (io) {
      for (const memberId of otherMemberIds) {
        const socketIds = getOnlineSocketIds(memberId)
        if (socketIds.length) io.to(socketIds).emit('chat:new-message', { conversationId: id, message: redact({ ...message }) })
      }
    }

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

// PUT /api/chat/conversations/:id/read — advance this member's read cursor to
// now, and mark every message-receipt row for this user in this conversation
// as read (so the SENDER's tri-state status can move to "Read" — E6).
router.put('/conversations/:id/read', auth, async (req, res) => {
  try {
    const { id } = req.params
    if (!(await requireMembership(id, req.user.id))) {
      return res.status(403).json({ message: 'Not a member of this conversation.' })
    }
    const now = new Date()
    await Promise.all([
      prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId: id, userId: req.user.id } },
        data: { lastReadAt: now },
      }),
      prisma.chatMessageReceipt.updateMany({
        where: { userId: req.user.id, readAt: null, message: { conversationId: id } },
        data: { readAt: now, deliveredAt: now }, // reading it proves it was delivered, even if the delivered-push was missed
      }),
    ])
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

// GET /api/chat/search?q=... — message content search (E6), scoped to
// conversations the requester is a member of. Simple `contains`; fine at
// this scale — Postgres full-text search is a reasonable future upgrade if
// it's ever needed, not before.
router.get('/search', auth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim()
    if (!q) return res.json([])

    const results = await prisma.chatMessage.findMany({
      where: {
        body: { contains: q, mode: 'insensitive' },
        deletedAt: null,
        conversation: { members: { some: { userId: req.user.id } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        fromUser: { select: USER_SELECT },
        conversation: { include: { members: { include: { user: { select: USER_SELECT } } } } },
      },
    })

    res.json(results.map(m => ({
      id: m.id,
      conversationId: m.conversationId,
      conversationLabel: m.conversation.isGroup
        ? (m.conversation.name || 'Group')
        : (m.conversation.members.find(mem => mem.userId !== req.user.id)?.user.name || 'Unknown'),
      body: m.body,
      fromUser: m.fromUser,
      createdAt: m.createdAt,
    })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
