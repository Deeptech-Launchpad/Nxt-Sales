// One-time backfill (Update 3 / E2, step 2 of 4): moves every existing
// ChatMessage row onto the new Conversation/ConversationMember schema.
// fromUserId/toUserId/isRead are read here but NOT modified or dropped —
// that's a separate follow-up migration, run only after
// verify-chat-backfill.js confirms every row has a conversationId.
//
// Idempotent: re-running finds each pair's existing 2-member conversation
// (by intersecting ConversationMember rows) instead of creating a duplicate,
// and only touches messages where conversationId IS NULL.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// A 1:1 chat has messages going both directions (fromUserId/toUserId swap
// per message), so the two participants must be canonicalized into one
// ordered pair or every conversation would be created twice.
function pairKey(a, b) {
  return [a, b].sort().join(':')
}

async function findExisting1on1(userA, userB) {
  const membershipsA = await prisma.conversationMember.findMany({ where: { userId: userA }, select: { conversationId: true } })
  const membershipsB = await prisma.conversationMember.findMany({ where: { userId: userB }, select: { conversationId: true } })
  const bIds = new Set(membershipsB.map(m => m.conversationId))
  const shared = membershipsA.map(m => m.conversationId).filter(id => bIds.has(id))
  if (shared.length === 0) return null

  for (const id of shared) {
    const conv = await prisma.conversation.findUnique({ where: { id }, include: { members: true } })
    if (conv && !conv.isGroup && conv.members.length === 2) return conv
  }
  return null
}

async function main() {
  const unlinked = await prisma.chatMessage.findMany({
    where: { conversationId: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fromUserId: true, toUserId: true, isRead: true, createdAt: true },
  })

  if (unlinked.length === 0) {
    console.log('[backfill] Nothing to do — every message already has a conversationId.')
    return
  }
  console.log(`[backfill] ${unlinked.length} message(s) to migrate.`)

  const byPair = new Map() // pairKey -> { userA, userB, messages: [] }
  for (const m of unlinked) {
    const key = pairKey(m.fromUserId, m.toUserId)
    if (!byPair.has(key)) byPair.set(key, { userA: m.fromUserId, userB: m.toUserId, messages: [] })
    byPair.get(key).messages.push(m)
  }
  console.log(`[backfill] ${byPair.size} distinct conversation(s) to create/find.`)

  let conversationsCreated = 0, conversationsFound = 0, messagesLinked = 0

  for (const { userA, userB, messages } of byPair.values()) {
    let conv = await findExisting1on1(userA, userB)
    if (conv) {
      conversationsFound++
    } else {
      conv = await prisma.conversation.create({
        data: {
          isGroup: false,
          createdById: messages[0].fromUserId, // whoever sent the earliest message in the pair
          members: { create: [{ userId: userA }, { userId: userB }] },
        },
      })
      conversationsCreated++
    }

    await prisma.chatMessage.updateMany({
      where: { id: { in: messages.map(m => m.id) } },
      data: { conversationId: conv.id },
    })
    messagesLinked += messages.length

    const last = messages[messages.length - 1]
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: last.createdAt, lastMessageId: last.id },
    })

    // Approximate each member's read cursor from the old isRead flag: the
    // most recent message THEY received that was already marked read.
    for (const memberId of [userA, userB]) {
      const lastReadMsg = [...messages].reverse().find(m => m.toUserId === memberId && m.isRead)
      if (lastReadMsg) {
        await prisma.conversationMember.updateMany({
          where: { conversationId: conv.id, userId: memberId },
          data: { lastReadAt: lastReadMsg.createdAt },
        })
      }
    }
  }

  console.log(`[backfill] Done: ${conversationsCreated} conversation(s) created, ${conversationsFound} found/reused, ${messagesLinked} message(s) linked.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
