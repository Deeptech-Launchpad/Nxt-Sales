// Tests for the Gmail-draft exclusion fix in runEmailSync (server/src/routes/email.js)
// and for the state of the known bmsupplies case in the database.
//
//   node scripts/test-draft-exclusion.js
//
// No test framework and no new dependencies — this project has neither, and a
// sync-correctness guard should not be the thing that introduces one.
//
// Part A exercises the exclusion predicate itself. It is duplicated here rather
// than imported because email.js cannot be required without a full environment
// (jwtSecret validation, Prisma, Passport) — so the predicate is kept
// byte-identical to the one in runEmailSync and asserted against below. If you
// change one, change the other.
//
// Part B asserts the real rows behind the reported incident, so a regression
// that re-hides the real email or re-shows the draft fails loudly.
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── the predicate under test — must match email.js exactly ─────────────────
const excludeDrafts = (messages) =>
  (messages || []).filter(m => !(Array.isArray(m.labelIds) && m.labelIds.includes('DRAFT')))

let pass = 0, fail = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log(`  PASS  ${name}`) }
  else {
    fail++
    console.log(`  FAIL  ${name}`)
    console.log(`        actual   ${JSON.stringify(actual)}`)
    console.log(`        expected ${JSON.stringify(expected)}`)
  }
}

// The real bmsupplies thread as Gmail returned it.
const BM_DRAFT = '1a080b3eb6b0db8d'
const BM_REAL = '1a080b9ded657687'
const BM_THREAD = '1a080b1ea398add3'

function partA() {
  console.log('\nPart A — draft exclusion in the sync pipeline\n')

  // 1. Gmail message with DRAFT label → excluded.
  check('1. DRAFT-labelled message is excluded',
    excludeDrafts([{ id: 'd1', labelIds: ['DRAFT'] }]).map(m => m.id), [])

  // 2. Gmail message without DRAFT → processed normally.
  check('2. non-DRAFT message is kept',
    excludeDrafts([{ id: 'm1', labelIds: ['INBOX'] }]).map(m => m.id), ['m1'])

  // 3. Real sent message → still imported.
  check('3. real SENT message is kept',
    excludeDrafts([{ id: 's1', labelIds: ['SENT'] }]).map(m => m.id), ['s1'])

  // 4. Real received message → still imported.
  check('4. real received message is kept',
    excludeDrafts([{ id: 'r1', labelIds: ['INBOX', 'UNREAD', 'IMPORTANT', 'CATEGORY_PERSONAL'] }]).map(m => m.id), ['r1'])

  // 5. Draft reply inside an existing thread → draft excluded, history preserved.
  check('5. draft reply dropped, real thread history preserved',
    excludeDrafts([
      { id: 'sent1', labelIds: ['SENT'] },
      { id: 'recv1', labelIds: ['INBOX'] },
      { id: 'sent2', labelIds: ['SENT'] },
      { id: 'draftReply', labelIds: ['DRAFT'] },
    ]).map(m => m.id), ['sent1', 'recv1', 'sent2'])

  // 6. Message with no labelIds → NOT accidentally excluded.
  check('6a. missing labelIds is kept', excludeDrafts([{ id: 'x' }]).map(m => m.id), ['x'])
  check('6b. null labelIds is kept', excludeDrafts([{ id: 'y', labelIds: null }]).map(m => m.id), ['y'])
  check('6c. empty labelIds is kept', excludeDrafts([{ id: 'z', labelIds: [] }]).map(m => m.id), ['z'])

  // 7/8. The exact incident: draft excluded, real send kept.
  check('7+8. bmsupplies thread keeps only the real 4:44 send',
    excludeDrafts([
      { id: BM_DRAFT, labelIds: ['DRAFT'] },
      { id: BM_REAL, labelIds: ['SENT'] },
    ]).map(m => m.id), [BM_REAL])

  // Guards against over-matching.
  check('9. a custom label merely containing "DRAFT" does not match',
    excludeDrafts([{ id: 'c1', labelIds: ['Label_DRAFTS_ARCHIVE', 'SENT'] }]).map(m => m.id), ['c1'])
  check('10. lowercase "draft" is not Gmail\'s system label and is kept',
    excludeDrafts([{ id: 'c2', labelIds: ['draft'] }]).map(m => m.id), ['c2'])

  // Degenerate payloads must not throw.
  check('11. empty thread', excludeDrafts([]).map(m => m.id), [])
  check('12. absent messages array', excludeDrafts(undefined).map(m => m.id), [])

  // A draft-only thread collapses to nothing, which is what triggers the
  // early return in runEmailSync.
  check('13. draft-only thread yields no messages',
    excludeDrafts([{ id: 'd', labelIds: ['DRAFT'] }]).length, 0)
}

async function partB() {
  console.log('\nPart B — the real rows behind the incident\n')

  const rows = await prisma.activity.findMany({
    where: { threadId: BM_THREAD, type: 'email' },
    select: {
      id: true, messageId: true, rfcMessageId: true, createdAt: true, subject: true,
      attachments: true, body: true, bodyHtml: true, gmailDeletedAt: true, trackingId: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const draftRow = rows.find(r => r.messageId === BM_DRAFT)
  const realRow = rows.find(r => r.messageId === BM_REAL)

  check('14. both rows still exist in the database (nothing was deleted)',
    [!!draftRow, !!realRow], [true, true])
  if (!realRow) { console.log('  (real row missing — remaining assertions skipped)'); return }

  // 9. The 4:44 email still has all 4 attachments.
  const realAtt = (realRow.attachments || []).map(a => a.filename)
  check('15. the real 4:44 send still has all 4 attachments', realAtt.length, 4)
  check('16. all four expected filenames are present', [
    realAtt.includes('BM Supplies - Before Enrichment Page.pdf'),
    realAtt.includes('Widespread-Lavatory-Faucet_After Enrichment.pdf'),
    realAtt.includes('PDP_Enrichment_Report_John_BM_Supplies.pdf'),
    realAtt.includes('AltiusNXT_Corporate_Deck.pdf'),
  ], [true, true, true, true])

  // 10. Full email body remains available.
  check('17. the real send still has an HTML body', (realRow.bodyHtml || '').length > 0, true)
  check('18. its body ends with the signature, not mid-word',
    /altiusnxt\.com|<\/div>\s*$/i.test((realRow.bodyHtml || '').slice(-400)), true)

  // 8. The real send must remain visible.
  check('19. the real 4:44 send is NOT hidden', realRow.gmailDeletedAt, null)

  // Both were composed in Gmail, so neither carries a CRM tracking pixel —
  // this is what gate L2 of the reconcile script relies on.
  check('20. neither row is a CRM-composer send (trackingId null)',
    [realRow.trackingId, draftRow ? draftRow.trackingId : null], [null, null])

  // The two carry genuinely different Message-IDs — which is why dedup by
  // rfcMessageId could never have collapsed them, and why the fix had to be
  // at the label level instead.
  if (draftRow) {
    check('21. the draft and the real send have different RFC Message-IDs',
      draftRow.rfcMessageId !== realRow.rfcMessageId, true)
    check('22. the draft has strictly fewer attachments than the real send',
      (draftRow.attachments || []).length < realAtt.length, true)
  }

  // Guard the whole-database invariant the sync depends on.
  const dupes = await prisma.$queryRawUnsafe(
    `SELECT "messageId" FROM "Activity" WHERE "messageId" IS NOT NULL
     GROUP BY "messageId" HAVING count(*) > 1`)
  check('23. no duplicate messageId anywhere (checklist 0.4)', dupes.length, 0)
}

// ── Part C — successor selection ───────────────────────────────────────────
// Mirrors the L3-L6 successor pick in reconcile-draft-imports.js. Kept
// byte-equivalent to the real thing for the same reason as the predicate
// above: the script cannot be required without a full environment. Change one,
// change the other.
const normSubject = (s) => (s || '').replace(/^\s*((re|fwd|fw)\s*:\s*)+/i, '').trim().toLowerCase()
const normBody = (s) => (s || '').replace(/\s+/g, ' ').trim()
const fileNames = (a) => (Array.isArray(a) ? a : []).map(x => x && x.filename).filter(Boolean)
const addrsOf = (v) => ((v || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [])
const GAP_MS = 6 * 3600 * 1000

function pickSuccessor(c, later) {
  const cb = normBody(c.body)
  if (!cb) return null
  const probe = cb.slice(0, Math.min(cb.length, 500))
  const ca = fileNames(c.attachments)
  const qualifying = later.filter(s => {
    if (normSubject(s.subject) !== normSubject(c.subject)) return false
    if (!addrsOf(s.toEmail).some(a => addrsOf(c.toEmail).includes(a))) return false
    if (!(s.createdAt > c.createdAt && (s.createdAt - c.createdAt) <= GAP_MS)) return false
    const sa = fileNames(s.attachments)
    if (!ca.every(f => sa.includes(f))) return false
    if (ca.length > 0 && ca.length >= sa.length) return false
    const sb = normBody(s.body)
    return cb === sb || sb.startsWith(probe)
  })
  return qualifying.length ? qualifying[qualifying.length - 1] : null
}

const T = (iso) => new Date(iso)
const msg = (id, iso, atts, body = 'Hi, I hope you are doing well.') => ({
  messageId: id, createdAt: T(iso), subject: 'Elevate Your eCommerce Performance',
  toEmail: 'amcquillan@gunz.com.au', body,
  attachments: atts.map(f => ({ filename: f })),
})

const A = 'Gunz Dental - Before Enrichment Page.pdf'
const B = 'Disposable-Nitrile-Gloves-After Enrichment Page.pdf'
const C = 'Gunz_Dental_PDP_Enrichment_Report_Alex.pdf'
const D = 'AltiusNXT_Corporate_Deck.pdf'

function partC() {
  console.log('\nPart C — successor selection (draft chains)\n')

  // The real production chain: draft -> draft -> send, thread 1a08fdcca503f8b4.
  const d1 = msg('1a08fdfe8e15d378', '2026-09-11T09:50:10Z', [A])
  const d2 = msg('1a08fe221c9fd86c', '2026-09-11T09:52:35Z', [A, B])
  const real = msg('1a09016edbd23b5f', '2026-09-11T10:50:13Z', [A, B, C, D])

  // THE REGRESSION: the first link must resolve to the real send, not to the
  // middle draft. Pairing with the middle draft is what left this row visible.
  check('24. chain link 1 resolves to the REAL send, not the middle draft',
    pickSuccessor(d1, [d2, real])?.messageId, real.messageId)
  check('25. chain link 2 resolves to the real send',
    pickSuccessor(d2, [real])?.messageId, real.messageId)
  check('26. the real send itself has no successor',
    pickSuccessor(real, []), null)

  // A plain two-message pair still behaves exactly as before.
  check('27. simple draft -> send pair still resolves',
    pickSuccessor(d2, [real])?.messageId, real.messageId)

  // Guards — none of these may produce a pair.
  check('28. attachments not a subset -> no pair',
    pickSuccessor(msg('x', '2026-09-11T09:50:00Z', ['unrelated.pdf']), [real]), null)
  check('29. candidate has MORE attachments -> no pair',
    pickSuccessor(msg('x', '2026-09-11T09:50:00Z', [A, B, C, D]),
      [msg('y', '2026-09-11T09:55:00Z', [A, B])]), null)
  check('30. body is not an earlier prefix -> no pair',
    pickSuccessor(msg('x', '2026-09-11T09:50:00Z', [A], 'Completely different text'), [real]), null)
  check('31. outside the composing window -> no pair',
    pickSuccessor(msg('x', '2026-09-10T09:50:00Z', [A]), [real]), null)
  check('32. different recipient -> no pair',
    pickSuccessor({ ...msg('x', '2026-09-11T09:50:00Z', [A]), toEmail: 'someone@else.com' }, [real]), null)
  check('33. empty body -> no pair',
    pickSuccessor(msg('x', '2026-09-11T09:50:00Z', [A], ''), [real]), null)

  // A later message that does NOT qualify must not be chosen just for being
  // last — the pick is the last QUALIFYING one, not the last one.
  const unrelated = { ...msg('z', '2026-09-11T11:00:00Z', []), subject: 'Something else' }
  check('34. a non-qualifying later message is never selected',
    pickSuccessor(d2, [real, unrelated])?.messageId, real.messageId)
}

;(async () => {
  partA()
  partC()
  await partB()
  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exitCode = fail ? 1 : 0
})()
  .catch(e => { console.error('ERROR', e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
