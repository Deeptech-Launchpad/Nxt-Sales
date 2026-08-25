const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Team Chat real-time foundation (Update 3 / E1/E3). Presence + typing —
// message send/receive still goes through the existing REST endpoints
// (server/src/routes/chat.js), so this stays a thin, independently-provable
// layer rather than a second source of truth for message data.

let io = null

// userId -> Set<socketId> — a user can have multiple tabs/devices open, so
// "online" only flips to false once EVERY socket for that user has gone away.
const onlineSockets = new Map()

function markOnline(userId, socketId) {
  if (!onlineSockets.has(userId)) onlineSockets.set(userId, new Set())
  const wasOffline = onlineSockets.get(userId).size === 0
  onlineSockets.get(userId).add(socketId)
  if (wasOffline) io.emit('presence:online', { userId })
}

function markOffline(userId, socketId) {
  const set = onlineSockets.get(userId)
  if (!set) return
  set.delete(socketId)
  if (set.size === 0) {
    onlineSockets.delete(userId)
    io.emit('presence:offline', { userId })
  }
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true },
  })

  // Same JWT already used by server/src/middleware/authMiddleware.js — no new
  // auth mechanism, just verified at handshake time instead of per-request.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      const user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret')
      socket.userId = user.id
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    markOnline(socket.userId, socket.id)

    // Tell the newly-connected client who else is currently online, since
    // 'presence:online' broadcasts only fire going forward from here.
    socket.emit('presence:snapshot', { onlineUserIds: [...onlineSockets.keys()] })

    // Conversation-scoped (works for both 1:1 and group) — verified against
    // real membership so a client can't spam a typing indicator into a
    // conversation it doesn't belong to.
    socket.on('typing:start', ({ conversationId }) => relayTyping(socket, conversationId, 'typing:start'))
    socket.on('typing:stop',  ({ conversationId }) => relayTyping(socket, conversationId, 'typing:stop'))

    socket.on('disconnect', () => markOffline(socket.userId, socket.id))
  })
}

// Socket.io accepts an array of socket ids as a "room" target for io.to(...).
function socketsFor(userId) {
  return [...(onlineSockets.get(userId) || [])]
}

async function relayTyping(socket, conversationId, event) {
  if (!conversationId) return
  try {
    const members = await prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    })
    const memberIds = new Set(members.map(m => m.userId))
    if (!memberIds.has(socket.userId)) return // not a member — silently ignore, never relay

    const targetSocketIds = [...memberIds]
      .filter(id => id !== socket.userId)
      .flatMap(socketsFor)
    if (targetSocketIds.length) io.to(targetSocketIds).emit(event, { conversationId, fromUserId: socket.userId })
  } catch {
    // typing indicators are best-effort — never crash the socket connection over one
  }
}

function getIO() {
  return io
}

// Exposed for chat.js — E6 uses this to know whether a message was actually
// pushed live (→ "Delivered") and to route the new-message / notification
// events to a specific member's connected tabs.
function getOnlineSocketIds(userId) {
  return socketsFor(userId)
}

function isUserOnline(userId) {
  return (onlineSockets.get(userId)?.size || 0) > 0
}

module.exports = { initSocket, getIO, getOnlineSocketIds, isUserOnline }
