// Single source of truth for the JWT signing secret.
//
// Every token this server issues or accepts is signed with this value, and
// authorization is authentication: a validly-signed token is trusted by every
// write route. A weak or guessable secret is therefore not a hardening issue,
// it is full CRM access.
//
// This module refuses to let the process start rather than falling back to a
// placeholder. The previous `process.env.JWT_SECRET || 'dev-secret'` pattern
// meant a missing env var silently downgraded the whole API to a secret that is
// published in this repository — anyone could mint themselves an admin token.
// Failing loudly at boot is the only safe behaviour: a server that will not
// start gets fixed, a server that quietly accepts forged tokens does not.
//
// Required at the very top of index.js so it runs before any route, job or
// socket module reads the value.

const MIN_LENGTH = 32

// Values that have shipped as defaults, examples or scaffolding at some point.
// Matching is substring-based and case-insensitive: `change-me` must be caught
// inside a longer string, which is exactly how such values survive into
// production.
const REJECTED_PATTERNS = [
  /dev-secret/i,
  /change[-_ ]?me/i,
  /your[-_ ]?(jwt[-_ ]?)?secret/i,
  /placeholder/i,
  /^example/i,
  /^secret$/i,
  /^test$/i,
  /supersecret/i,
]

function fail(reason) {
  // Deliberately never includes the value itself — this text reaches stdout,
  // PM2 logs and anywhere those are shipped.
  console.error('\n[FATAL] JWT_SECRET is not usable: ' + reason)
  console.error('        The server will not start. Set a strong JWT_SECRET in server/.env.')
  console.error('        Generate one with:  openssl rand -hex 48')
  console.error('        Note: changing it invalidates every existing session.\n')
  process.exit(1)
}

const secret = (process.env.JWT_SECRET || '').trim()

if (!secret) {
  fail('it is missing or empty.')
}
if (secret.length < MIN_LENGTH) {
  fail(`it is ${secret.length} characters; at least ${MIN_LENGTH} are required.`)
}
for (const pattern of REJECTED_PATTERNS) {
  if (pattern.test(secret)) {
    fail('it looks like a placeholder or a known default value.')
  }
}

module.exports = secret
