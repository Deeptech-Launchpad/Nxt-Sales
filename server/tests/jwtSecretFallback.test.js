// The JWT secret must never fall back to a built-in value - run with: node --test tests/
//
// routes/email.js used to verify tokens with `process.env.JWT_SECRET || 'dev-secret'`. 'dev-secret' is published in
// this repository, so a missing variable there would have accepted a token anyone could mint. These tests prove:
//   1. the one secret module refuses a missing, empty, short or placeholder value (the process exits, in a child
//      process so this run survives), and never prints the value;
//   2. loading the email routes without a good secret also exits - there is no code path that verifies with a default;
//   3. with the correct secret configured, email authentication and the Marketing service token (the same signing
//      call the Marketing AI Agent makes) work, and a token signed with the old default is refused;
//   4. nothing in src/ or scripts/ can bring the fallback back.
// No database, no Gmail, no network beyond a local loopback server. Nothing is sent.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SERVER = path.resolve(__dirname, '..')
const SECRET_MODULE = path.join(SERVER, 'src', 'config', 'jwtSecret.js')
const EMAIL_MODULE = path.join(SERVER, 'src', 'routes', 'email.js')
const GOOD = crypto.randomBytes(48).toString('hex') // a throwaway value for this run only

/** Runs `code` in a fresh node process whose ONLY JWT_SECRET is `value` (undefined = the variable does not exist). */
function child(code, value) {
  const env = { ...process.env }
  delete env.JWT_SECRET
  if (value !== undefined) env.JWT_SECRET = value
  return spawnSync(process.execPath, ['-e', code], { env, encoding: 'utf8', cwd: SERVER, timeout: 30000 })
}
const loadSecret = `process.stdout.write('LOADED:' + require(${JSON.stringify(SECRET_MODULE)}).length)`

// ── 1. the secret module ─────────────────────────────────────────────────────
const refused = [
  ['missing', undefined, /missing or empty/],
  ['empty', '', /missing or empty/],
  ['only spaces', '      ', /missing or empty/],
  ['the old default, exactly', 'dev-secret', /characters; at least/],
  ['the old default inside a long value', 'dev-secret'.padEnd(48, 'x'), /placeholder or a known default/],
  ['too short', 'a'.repeat(31), /at least 32/],
  ['an example placeholder', 'change-me-' + 'z'.repeat(40), /placeholder or a known default/],
]
for (const [name, value, why] of refused) {
  test(`jwtSecret refuses a ${name} secret: the process exits and nothing is printed that reveals it`, () => {
    const r = child(loadSecret, value)
    assert.equal(r.status, 1, `expected exit code 1, got ${r.status}`)
    assert.match(r.stderr, /JWT_SECRET is not usable/)
    assert.match(r.stderr, why)
    assert.doesNotMatch(r.stdout, /LOADED/) // it never handed a secret to anyone
    if (value && value.trim()) assert.ok(!r.stderr.includes(value) && !r.stdout.includes(value), 'the value must not appear in output')
  })
}

test('jwtSecret accepts a strong configured secret, trimmed, and exports exactly that', () => {
  const r = child(loadSecret, `  ${GOOD}  `)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, `LOADED:${GOOD.length}`)
})

// ── 2. the email routes cannot load without it ───────────────────────────────
for (const [name, value] of [['missing', undefined], ['empty', ''], ['the old default', 'dev-secret']]) {
  test(`routes/email.js will not load with a ${name} secret (no default is substituted)`, () => {
    const r = child(`require(${JSON.stringify(EMAIL_MODULE)}); process.stdout.write('LOADED')`, value)
    assert.equal(r.status, 1, `expected exit code 1, got ${r.status}\n${r.stderr.slice(0, 400)}`)
    assert.match(r.stderr, /JWT_SECRET is not usable/)
    assert.doesNotMatch(r.stdout, /LOADED/)
  })
}

// The old line read the raw variable, the rest of the server reads the trimmed one. A value with stray spaces in .env
// (easy to do when pasting) made email status disagree with every other route. Now they share one value.
test('a secret with stray spaces in .env is verified the same way by the email routes as everywhere else', () => {
  const code = `
    const jwt = require('jsonwebtoken'); const express = require('express')
    const stub = require.resolve('@prisma/client')
    require.cache[stub] = { id: stub, filename: stub, loaded: true, exports: {
      PrismaClient: class { constructor() { return { emailAccount: { findFirst: async () => ({ email: 'x@example.test' }) } } } },
      Prisma: { sql() {}, join() {}, empty: '' } } }
    const app = express(); app.use('/api/email', require(${JSON.stringify(EMAIL_MODULE)}))
    const s = app.listen(0, '127.0.0.1', async () => {
      const token = jwt.sign({ id: 'u' }, ${JSON.stringify(GOOD)})
      const r = await fetch('http://127.0.0.1:' + s.address().port + '/api/email/status', { headers: { Authorization: 'Bearer ' + token } })
      process.stdout.write(JSON.stringify(await r.json())); s.close(); process.exit(0)
    })`
  const r = child(code, `  ${GOOD}  `)
  assert.equal(r.status, 0, r.stderr.slice(0, 400))
  assert.deepEqual(JSON.parse(r.stdout), { connected: true, email: 'x@example.test' })
})

// ── 3. correct configuration: email auth and Marketing-to-CRM auth still work ─
// The real routes/email.js and the real authMiddleware, with only the database replaced.
const jwt = require('jsonwebtoken')
const express = require('express')
let server, base, queries
const fakePrisma = {
  emailAccount: {
    findFirst: async ({ where }) => {
      queries.push(['emailAccount', where.userId])
      return where.userId === 'u-with-gmail' ? { email: 'sales@example.test' } : null
    },
  },
  user: {
    findUnique: async ({ where }) => {
      queries.push(['user', where.id])
      if (where.id === 'svc-marketing') return { status: 'active', role: 'member' }
      if (where.id === 'u-with-gmail') return { status: 'active', role: 'admin' }
      return null
    },
  },
}

before(async () => {
  process.env.JWT_SECRET = GOOD
  const stubPath = require.resolve('@prisma/client')
  require.cache[stubPath] = {
    id: stubPath, filename: stubPath, loaded: true,
    exports: { PrismaClient: class { constructor() { return fakePrisma } }, Prisma: { sql: (...a) => a, join: (...a) => a, empty: '' } },
  }
  const emailRouter = require(EMAIL_MODULE)
  const authMiddleware = require('../src/middleware/authMiddleware')
  const app = express()
  app.use('/api/email', emailRouter)
  app.get('/probe', authMiddleware, (req, res) => res.json({ id: req.user.id, role: req.user.role }))
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => { if (server) server.close() })

const get = (p, token) => fetch(base + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
const reset = () => { queries = [] }

test('email status: a token signed with the configured secret is accepted', async () => {
  reset()
  const token = jwt.sign({ id: 'u-with-gmail', email: 'a@example.test', name: 'A', role: 'admin' }, GOOD, { expiresIn: '7d' })
  const r = await get('/api/email/status', token)
  assert.deepEqual(r.body, { connected: true, email: 'sales@example.test' })
  assert.deepEqual(queries, [['emailAccount', 'u-with-gmail']])
})

test('email status: a token signed with the OLD default "dev-secret" is not accepted, and nothing is looked up', async () => {
  reset()
  const forged = jwt.sign({ id: 'u-with-gmail', role: 'admin' }, 'dev-secret', { expiresIn: '7d' })
  const r = await get('/api/email/status', forged)
  assert.deepEqual(r.body, { connected: false, email: null })
  assert.deepEqual(queries, []) // the forged id was never used
})

test('email status: other secrets, expired tokens, garbage and no token are all "not connected"', async () => {
  reset()
  const other = jwt.sign({ id: 'u-with-gmail' }, crypto.randomBytes(48).toString('hex'))
  const expired = jwt.sign({ id: 'u-with-gmail' }, GOOD, { expiresIn: -10 })
  for (const t of [other, expired, 'not-a-token', '']) assert.deepEqual((await get('/api/email/status', t)).body, { connected: false, email: null })
  assert.deepEqual((await get('/api/email/status')).body, { connected: false, email: null })
  assert.deepEqual(queries, [])
})

test('Marketing-to-CRM: the service token the Marketing AI Agent signs is accepted by the real auth middleware', async () => {
  reset()
  // The same call as marketing-agent/src/crm/nxtSales/httpClient.ts serviceToken(): HS256, 10-minute life.
  const token = jwt.sign({ id: 'svc-marketing', email: 'marketing-agent@example.test', name: 'Marketing Agent (service)', role: 'member' }, GOOD, { expiresIn: 600 })
  const r = await get('/probe', token)
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, { id: 'svc-marketing', role: 'member' }) // role is re-read from the database, as before
})

test('Marketing-to-CRM: a service token signed with a different secret, or the old default, is refused (401)', async () => {
  reset()
  for (const bad of [crypto.randomBytes(48).toString('hex'), 'dev-secret']) {
    const t = jwt.sign({ id: 'svc-marketing', role: 'member' }, bad, { expiresIn: 600 })
    assert.equal((await get('/probe', t)).status, 401)
  }
  assert.equal((await get('/probe')).status, 401)
  assert.deepEqual(queries, [])
})

test('the NXT Sales sign-in token (7 days, as routes/auth.js issues it) still passes the middleware', async () => {
  reset()
  const t = jwt.sign({ id: 'u-with-gmail', email: 'a@example.test', name: 'A', role: 'admin' }, GOOD, { expiresIn: '7d' })
  assert.deepEqual((await get('/probe', t)).body, { id: 'u-with-gmail', role: 'admin' })
})

// ── 4. the fallback cannot come back ─────────────────────────────────────────
function jsFiles(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') out.push(...jsFiles(f)) } else if (f.endsWith('.js')) out.push(f)
  }
  return out
}
const rel = (f) => path.relative(SERVER, f).split(path.sep).join('/')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('no source file contains a built-in secret: "dev-secret" appears only in the module that REJECTS it', () => {
  const hits = [...jsFiles(path.join(SERVER, 'src')), ...jsFiles(path.join(SERVER, 'scripts'))]
    .filter((f) => /dev-secret/i.test(strip(fs.readFileSync(f, 'utf8'))))
    .map(rel)
  assert.deepEqual(hits, ['src/config/jwtSecret.js'])
})

test('only config/jwtSecret.js reads process.env.JWT_SECRET; nothing falls back to a non-empty value', () => {
  const files = [...jsFiles(path.join(SERVER, 'src')), ...jsFiles(path.join(SERVER, 'scripts'))]
  const readers = files.filter((f) => /process\.env\.JWT_SECRET/.test(strip(fs.readFileSync(f, 'utf8')))).map(rel)
  assert.deepEqual(readers, ['src/config/jwtSecret.js'])
  const fallbacks = files.filter((f) => /\b(JWT_)?SECRET\s*\|\|\s*['"`][^'"`]/.test(strip(fs.readFileSync(f, 'utf8')))).map(rel)
  assert.deepEqual(fallbacks, [])
})

test('every file that signs or verifies a token gets its secret from the one module', () => {
  const users = jsFiles(path.join(SERVER, 'src')).filter((f) => /jwt\.(sign|verify)\(/.test(strip(fs.readFileSync(f, 'utf8'))))
  assert.ok(users.length >= 6, 'expected the known signing/verifying files to be found')
  for (const f of users) assert.match(fs.readFileSync(f, 'utf8'), /require\(['"]\.\.?\/(?:\.\.\/)?config\/jwtSecret['"]\)/, `${rel(f)} must use config/jwtSecret`)
})
