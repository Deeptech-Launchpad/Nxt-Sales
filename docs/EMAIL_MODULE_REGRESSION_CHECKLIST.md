# Email Module — Regression Checklist

Run every scenario below on a clean database before commit/deploy. All must pass.
"Clean" means: no leftover test companies with internal-team addresses (the "sara"
lesson), a real connected Gmail account, and at least one company using a genuine
external test address so sync has real signal to match against.

Mark each row Pass/Fail with a one-line note. Any Fail blocks commit until resolved
and re-verified — do not partially sign off.

---

## 0. Pre-flight (environment sanity)

| # | Check | Expected |
|---|---|---|
| 0.1 | `node -c server/src/routes/email.js` | No syntax errors |
| 0.2 | `npm run build` (client) | Builds clean, no new warnings beyond the known chunk-size notice |
| 0.3 | Server boots (`node src/index.js`) | `✓ Server running` with no startup errors |
| 0.4 | `SELECT COUNT(*) FROM "Activity" WHERE messageId IS NOT NULL GROUP BY messageId HAVING COUNT(*)>1` | 0 rows (no duplicate messageId) |
| 0.5 | Test company has a **real external** email address, not an internal team/CRM-user address | Confirmed manually before testing begins |

---

## 1. Matching rules (the root-cause fix — highest priority)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1.1 | Genuine correspondence imports | Real thread: connected mailbox ↔ company address, direct From/To | Thread appears under the company |
| 1.2 | **Third-party co-recipient thread is excluded** (the exact incident) | A thread where an outside sender emails a group that happens to include both the connected mailbox and a company address, but neither ever emails the other directly | Thread does **not** appear on the company |
| 1.3 | Company-address Cc-only is excluded | User emails a third party; company address only Cc'd | Not imported |
| 1.4 | User Cc-only is excluded | Company emails a third party; user only Cc'd | Not imported |
| 1.5 | Unrelated personal mail excluded | Any mail with neither the user nor a company address as sender/recipient | Not imported |
| 1.6 | Multiple company addresses — correct grouping | Company has 3+ saved addresses, each with separate real correspondence | Each conversation appears under its own matched address, not merged |
| 1.7 | Own-address guard | A company's saved address equals the connected mailbox itself | That address is excluded from matching; UI shows the "ignored own address" notice |
| 1.8 | Reconciliation self-heals | A company address is edited/removed after prior sync created links | Next sync unlinks (not deletes) rows that no longer qualify under current rules |
| 1.9 | Reconciliation matches import rule exactly | Compare `anchorForAddresses` used in both paths | Same function, same result for same input — no drift |

## 2. Duplicate / idempotency

| # | Scenario | Expected |
|---|---|---|
| 2.1 | Re-run sync immediately with no new mail | `synced: 0`, no duplicate rows, no errors |
| 2.2 | Reply arrives, re-sync | New message appended to the same thread; existing messages untouched (ids, trackingId, openCount unchanged) |
| 2.3 | Two syncs for the same company fired at once (two browser tabs / rapid double-click) | Single-flight lock: second call awaits the first's result, no duplicate writes |
| 2.4 | Message already exists as an orphan (companyId null) from a `/send` before company context existed | Sync adopts it (sets companyId + matchedCompanyEmail), does not create a second row |
| 2.5 | Message correctly linked to a **different** company | Never stolen/reassigned by another company's sync |

## 3. Conversation hierarchy & UI

| # | Scenario | Expected |
|---|---|---|
| 3.1 | Company → Address → Thread → Messages | Grouping renders correctly, addresses in saved order, primary first |
| 3.2 | Address with zero conversations | Still listed, shows "No conversations with this address yet" |
| 3.3 | Open a thread with 5+ messages | **All** messages shown in chronological order, none hidden behind a count |
| 3.4 | Attachments shown per message | Filenames visible, no live Gmail call needed to see them |
| 3.5 | Drawer closes / reopens | No stale content from a previously opened thread |
| 3.6 | Switch company while drawer open | Drawer closes; no cross-company content bleed |

## 4. Tracking

| # | Scenario | Expected |
|---|---|---|
| 4.1 | Sender opens their own sent email | Real pixel hit — `openCount` increments, `firstOpenedAt`/`lastOpenedAt` set |
| 4.2 | Same user views their own sent message in the thread drawer | Tracking badge visible (Opened N× or Sent) |
| 4.3 | **A different CRM user views the same company's thread** | Tracking data is **not** shown for messages they didn't send (sender-private) |
| 4.4 | Received (inbound) message | No tracking badge at all, ever |
| 4.5 | Notification vs Activity view agreement | Notification "opened" and the thread drawer's status always agree — no more delete/recreate churn to cause drift |

## 5. Compose flow

| # | Scenario | Expected |
|---|---|---|
| 5.1 | Signature on first send in a new thread | Present (text + image) |
| 5.2 | Signature on a reply / Continue Existing Thread | Present, identical to first send — verified against Gmail's own Sent-folder copy, not just our DB |
| 5.3 | Signature across Templates 1–4 sequentially, same thread | Present on every send regardless of template |
| 5.4 | Click a company email address in Company Detail | Opens Marketing → Email with that address prefilled in To, company context carried |
| 5.5 | "Email" quick action / no specific address | Opens composer with primary address, company context carried |
| 5.6 | Send with attachments | Uses multipart path; falls back to base64 path on failure; attachment still present in Gmail Sent copy |
| 5.7 | Send with attachments up to ~40MB combined | No 413 — body limit fix in place |
| 5.8 | Company detail conversation cache after send | Returns to Company Detail — sent email visible immediately, no stale cache (`invalidateCompanyEmail` fired) |

## 6. Deliverability report

| # | Scenario | Expected |
|---|---|---|
| 6.1 | No AI key configured | Report completes in ~0.1s (deterministic + auth-check only) |
| 6.2 | AI key configured, all models healthy | Report completes normally, AI suggestions present |
| 6.3 | AI key configured, preferred model returns 429/404 | Falls back through the list, still completes in well under a minute (bounded by the 12s per-attempt timeout, not unbounded) |
| 6.4 | AI key configured, a model hangs/unresponsive | That single attempt aborts at 12s and moves on — does not stall the whole report |

## 7. Performance / caching

| # | Scenario | Expected |
|---|---|---|
| 7.1 | Reopen Emails tab within 5 minutes of last sync | Instant, from cache, zero network requests |
| 7.2 | Switch to All Activities and back | No re-fetch, no re-sync |
| 7.3 | Cache older than 5 minutes | Triggers a real sync automatically |
| 7.4 | Switch companies | No flash of the previous company's data |
| 7.5 | Company addresses edited | Emails tab cache invalidated, regroups correctly on next view |
| 7.6 | Sync on a company with a long, mostly-already-synced history | Fast path skips `threads.get` for unchanged threads (`threadsUnchanged` count > 0 in response) |

## 8. Removed-feature regression (confirm no dead paths reappear)

| # | Scenario | Expected |
|---|---|---|
| 8.1 | "Sent Emails" nav item | Does not exist |
| 8.2 | "Unassigned" nav item / `/email/unassigned` route | Does not exist (404) |
| 8.3 | `EmailModal.jsx` ("Log an Email" popup) | File does not exist; no import references it |
| 8.4 | Analytics tab | Shows real counts from `/email/analytics` (Activity table), not `localStorage` |
| 8.5 | Company-less sent email (no companyId) | Still creates a valid Activity row with tracking; just has no dedicated UI surface post-Unassigned-removal — acceptable per your decision |

## 9. Company-wide shared history (per your architecture decision)

| # | Scenario | Expected |
|---|---|---|
| 9.1 | Two different CRM users, two different connected mailboxes, same company | Both users' correspondence appears together under the company (not filtered by viewer) |
| 9.2 | Read endpoints (`/conversations`, `/thread/:id`) | Confirmed: no `userId` filter — intentional, matches company-centric decision |

## 10. Import matching — Company module cross-check (unrelated fix, verify no regression)

| # | Scenario | Expected |
|---|---|---|
| 10.1 | Import a company sheet with header `CMS` | Maps correctly |
| 10.2 | Import with header variants (`C.M.S.`, `Co Phone No`, etc.) | Still maps via normalized matching |
| 10.3 | Import with a genuinely unrecognized column | Ignored, logged via console warning, not silently misfiled |

---

## Known accepted state (not regressions — confirm still true, don't "fix")

- `messageId` has **no unique DB constraint** yet (Critical item C3, not yet implemented — pending your decision on sequencing).
- No `SyncRun`/audit table yet (Critical item C2 — pending).
- The "sara" test company still contains the 481 rows from the matching-logic incident, pending your decision to clean it up.
- Schema drift: `trackingId`, `openCount`, `firstOpenedAt`, `lastOpenedAt`, `openHistory`, `callLogId`, `recordingUrl` have no migration file (flagged separately, not part of this checklist).

---

## Sign-off

- [ ] All sections 1–10 pass on a clean database
- [ ] No Fails outstanding
- [ ] Reviewed by: _______________
- [ ] Date: _______________
