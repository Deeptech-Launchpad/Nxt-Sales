// Creates the dedicated service identity the Marketing AI Agent signs its
// tokens as. Run on the server that owns the target database.
//
//   node scripts/create-service-user.js            preview only, writes nothing
//   node scripts/create-service-user.js --create   performs the insert
//
// Dry-run by default because this writes to a live database.
//
// The account is created with NO passwordHash and NO googleId, which is the
// point rather than an omission: POST /api/auth/login rejects any account
// without a passwordHash, so this identity cannot be signed into
// interactively. It exists only so the agent's JWT `id` claim names something
// real, and so its writes are attributable to the agent instead of to a
// person. Role is `member` — the lowest of member/admin/super_admin.
//
// Safety: refuses to touch a row that already exists. It never updates or
// deletes, and touches no table other than User.

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const EMAIL = 'marketingagent@altiusnxt.com'
const NAME = 'Marketing AI Agent'
const ROLE = 'member'
const STATUS = 'active'

const commit = process.argv.includes('--create')

function print(u) {
  console.log('  id     : ' + u.id)
  console.log('  email  : ' + u.email)
  console.log('  name   : ' + u.name)
  console.log('  role   : ' + u.role)
  console.log('  status : ' + u.status)
  console.log('  password set : ' + (u.passwordHash ? 'YES' : 'no (cannot log in interactively)'))
  console.log('  google linked: ' + (u.googleId ? 'YES' : 'no'))
}

;(async () => {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } })

  if (existing) {
    // Never modify a row that is already there — report and stop, so a re-run
    // is safe and an unexpected pre-existing account is surfaced rather than
    // silently altered.
    console.log('\nAccount already exists. Nothing was changed.\n')
    print(existing)
    await prisma.$disconnect()
    return
  }

  if (!commit) {
    console.log('\nDRY RUN — nothing written. Would create:\n')
    console.log('  email  : ' + EMAIL)
    console.log('  name   : ' + NAME)
    console.log('  role   : ' + ROLE)
    console.log('  status : ' + STATUS)
    console.log('  passwordHash / googleId : none (not interactively loginable)')
    console.log('\nRe-run with --create to perform the insert.\n')
    await prisma.$disconnect()
    return
  }

  const before = await prisma.user.count()
  const created = await prisma.user.create({
    data: { email: EMAIL, name: NAME, role: ROLE, status: STATUS },
    select: { id: true, email: true, name: true, role: true, status: true, passwordHash: true, googleId: true },
  })
  const after = await prisma.user.count()

  console.log('\nService user created.\n')
  print(created)
  console.log('\n  user count ' + before + ' -> ' + after + ' (exactly one row added)')
  console.log('  no existing user was read-modified-written, and no other table was touched.\n')

  await prisma.$disconnect()
})().catch(async (err) => {
  console.error('\nFAILED: ' + err.message + '\nNothing was created.\n')
  await prisma.$disconnect()
  process.exit(1)
})
