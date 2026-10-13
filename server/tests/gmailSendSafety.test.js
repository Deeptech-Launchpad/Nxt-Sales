// Tests for utils/gmailSendSafety.js — run with: node --test tests/gmailSendSafety.test.js
// When a Gmail send with attachments fails, a second send is allowed ONLY if
// the first certainly sent nothing; otherwise the email could arrive twice.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { GaxiosError } = require('gaxios')
const { gmailFailureIsSafeToRetry, GmailOutcomeUnknownError } = require('../src/utils/gmailSendSafety')

const config = { url: new URL('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send'), method: 'POST' }
const answered = (status) =>
  new GaxiosError(`Request failed with status code ${status}`, config, {
    status,
    statusText: '',
    headers: {},
    data: {},
    config,
  })

test('Gmail answered and refused it (4xx): nothing was sent, the plain send may be tried', () => {
  for (const s of [400, 401, 403, 404, 413, 429]) assert.equal(gmailFailureIsSafeToRetry(answered(s)), true, `status ${s}`)
})

test('Gmail server error or request timeout (5xx, 408): it may have been sent, never retried', () => {
  for (const s of [408, 500, 502, 503, 504]) assert.equal(gmailFailureIsSafeToRetry(answered(s)), false, `status ${s}`)
})

test('no answer at all (timeout, dropped connection): it may have been sent, never retried', () => {
  const reset = new GaxiosError('socket hang up', config)
  reset.code = 'ECONNRESET'
  assert.equal(gmailFailureIsSafeToRetry(reset), false)
  const aborted = new GaxiosError('The operation was aborted', config)
  assert.equal(gmailFailureIsSafeToRetry(aborted), false)
  const plainNet = Object.assign(new Error('read ETIMEDOUT'), { code: 'ETIMEDOUT' })
  assert.equal(gmailFailureIsSafeToRetry(plainNet), false)
})

test('an error on this server before any request was made: nothing was sent, may be tried', () => {
  assert.equal(gmailFailureIsSafeToRetry(new TypeError('part.body.pipe is not a function')), true)
})

test('nothing usable: treated as unknown', () => {
  assert.equal(gmailFailureIsSafeToRetry(null), false)
  assert.equal(gmailFailureIsSafeToRetry('boom'), false)
})

test('the unknown-outcome error tells the person to check the Sent folder', () => {
  const e = new GmailOutcomeUnknownError(new Error('socket hang up'))
  assert.equal(e.outcomeUnknown, true)
  assert.match(e.message, /may have been sent/)
  assert.match(e.message, /Sent folder/)
})
