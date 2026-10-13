// MAY A FAILED GMAIL SEND BE TRIED AGAIN? (2026-10-13)
//
// An email with attachments is first sent with Gmail's media upload. If that
// call fails, the send used to fall straight back to the plain `raw` call —
// but a failure does not always mean Gmail did NOT send it: when the upload
// reached Gmail and only the answer was lost (a timeout, a dropped connection,
// a Gmail server error), Gmail may already have sent the email, and sending it
// again gives the recipient two copies.
//
// So the second attempt is made ONLY when it is certain the first one sent
// nothing:
//   - Gmail answered and refused it (4xx other than 408 "timeout"), or
//   - the error happened on this server before any request was made (no
//     request config attached — e.g. the old "part.body.pipe" library error).
// Anything else is an UNKNOWN outcome: it is not retried, and the caller is
// told to check the sender's Sent folder (the Marketing bulk API records it as
// "unknown" and never resends it automatically).

/** True only when the failed Gmail call certainly sent nothing. */
function gmailFailureIsSafeToRetry(err) {
  if (!err || typeof err !== 'object') return false
  const status = Number(err.response?.status ?? err.status)
  if (err.response && Number.isInteger(status)) return status >= 400 && status < 500 && status !== 408
  // No answer from Gmail. Safe only if no request was ever made: a request
  // error from the HTTP client carries the request config (or a network code).
  return !err.config && !err.code && !err.response
}

/** The error raised when Gmail may have sent the email but did not confirm it. */
class GmailOutcomeUnknownError extends Error {
  constructor(cause) {
    super(
      'Gmail did not confirm whether this email was sent (' +
        String(cause?.message || 'no answer').slice(0, 200) +
        "). It may have been sent — check the Sent folder before sending it again.",
    )
    this.name = 'GmailOutcomeUnknownError'
    this.outcomeUnknown = true
  }
}

module.exports = { gmailFailureIsSafeToRetry, GmailOutcomeUnknownError }
