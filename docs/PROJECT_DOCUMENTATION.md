# NXT Sales CRM — Project Documentation

**Last updated:** 2026-07-28
**Purpose:** Complete, self-contained record of the project's architecture, decisions, completed work, and pending work — written so a developer with zero prior context can pick this up without needing the original conversation history.

---

## 1. What this project is

**NXT Sales** (internal name "Nxt MarketWiz") is an internal CRM for AltiusNXT Technologies. Stack:

- **Backend**: Node.js + Express, `server/src/`, PostgreSQL via Prisma ORM (`server/prisma/schema.prisma`)
- **Frontend**: React + Vite, `client/src/`
- **Auth**: JWT (email/password) + Google OAuth (Passport.js)
- **Deployment**: Single VPS, PM2 process manager, Nginx-style reverse proxy in front of both client and server
- **Real-time**: Socket.io (added this engagement — see §11)

Git remote: `https://github.com/Deeptech-Launchpad/Nxt-Sales.git`, branch `main`.

---

## 2. Engineering principles (standing rules for all future work)

These were established explicitly by the project owner partway through this engagement and apply to **every module, unless explicitly overridden**:

1. **Architecture First** — review existing architecture before adding to it; don't bolt on quick fixes that create long-term debt.
2. **Root Cause First** — for bugs, always find and fix the actual cause, not a symptom-level patch.
3. **Future Compatibility** — design so today's fix doesn't become tomorrow's blocker.
4. **Production Quality** — this is a long-term product, not a prototype. Code should be readable by a senior engineer years later.
5. **Minimize Future Fixes** — prefer the design that prevents a class of bug over one that patches a single instance.
6. **Before-coding process**: review architecture → identify long-term issues → recommend improvements → explain trade-offs → implement.
7. **If a requested implementation would create long-term technical debt, stop and explain why before proceeding** — recommend the better architectural solution first.
8. **One module fully finished before starting the next** — don't leave a module in a partially-completed architectural state to go work on something else.
9. **Never execute a real external-effect action** (Gmail sync, sending real email, etc.) **without explicit per-instance approval** — established after an incident (see §5.5) where an unfiltered test query triggered a real sync against a real person's Gmail account.
10. **Company-centric, not mailbox-centric** — the CRM's email history belongs to the *company*, not to whichever individual's mailbox happened to sync it. Read endpoints must never filter by the viewing user's own mailbox.
11. **Git discipline**: never commit unless explicitly asked; never use `git add -A` blindly — review and stage deliberately; two files are permanently excluded from every commit in this repo: `.claude/settings.local.json` and `"run cmd . txt"`.

---

## 3. High-level timeline

| Phase | What | Status |
|---|---|---|
| 1 | Email Sync architecture review + root-cause matching-logic fix | ✅ Done |
| 2 | Email Module regression checklist + production deployment | ✅ Done |
| 3 | Email "Continue Existing Thread" bug diagnosis | ⚠️ Diagnosed, **not fixed** |
| 4 | Dynamic Dropdown Management + international phone input (Update 2) | ✅ Done |
| 5 | Navigation fix — logo → Dashboard (Update 4) | ✅ Done |
| 6 | Company module: search expansion + Pin/Star (Update 5) | ✅ Done |
| 7 | Dashboard KPI widgets (Update 6) | ✅ Done |
| 8 | Team Chat real-time foundation (E1) | ✅ Done |
| 9 | Team Chat group schema + data migration (E2) | ✅ Done |
| 10 | Team Chat group UI (E3) | ✅ Done |
| 11 | Team Chat rich messaging: reply/edit/delete/mentions/pin (E4) | ✅ Done |
| 12 | Team Chat file sharing (E5) | ⏳ **Pending** |
| 13 | Team Chat read receipts / search / CRM-record attach / notifications (E6) | ⏳ **Pending** |
| 14 | Google OAuth `redirect_uri_mismatch` — diagnosed as Cloud Console config gap | ✅ Explained (external fix, not code) |
| 15 | Forgot Password — built end-to-end (was completely missing) | ✅ Done |
| 16 | Project backup + restore documentation | ✅ Done |

---

## 4. Module: Email System

### 4.1 Root cause found and fixed

**Bug**: emails could be imported into the wrong company. The original matching logic pooled *all* From/To/Cc/Bcc addresses on a message and asked only "does the connected mailbox AND a company address appear *somewhere* in this pool?" A third party emailing a distribution list that happened to include both the connected mailbox and a company address would satisfy that test — importing unrelated internal team email into a company's history.

**Fix**: `anchorForAddresses(fromRaw, toRaw, userEmail, companyAddresses)` in `server/src/routes/email.js` — requires the connected mailbox and a company address to sit on **opposite ends** of a message (one From, one To). Cc/Bcc never anchor a match. Used identically by both the import path and the reconciliation/unlink path, so tightening this rule automatically self-healed previously-wrongly-linked rows on the next sync.

### 4.2 Architecture decision: company-centric, not mailbox-centric

`GET /api/email/conversations` and `GET /api/email/thread/:threadId` have **no `userId` filter** — this is a deliberate, confirmed decision, not an oversight. The Email module represents the full communication history of the *company*, regardless of which team member's connected Gmail synced any given message.

### 4.3 Known architectural limitation (documented, not fixed)

Because `Activity.messageId` has no global uniqueness enforcement and a "never steal" guard prevents one company's sync from reassigning a message another company's sync already claimed, **two companies sharing an email address will have that address's messages permanently owned by whichever company synced first**. A non-blocking UI warning was built to surface this at save time (see §4.4) rather than fixing the deeper ownership model, which was assessed as a larger, separately-scoped redesign (`SyncRun`/audit table work, still not built — see §4.6).

### 4.4 Features built

- **Duplicate email-address conflict warning** — `client/src/components/EmailConflictWarning.jsx`, debounced, non-blocking, shown in `CreateCompanyModal.jsx` and `EditRecordModal.jsx`. Backed by `POST /api/companies/email-conflicts` (read-only, checks both the `email` column and `emails` JSONB array case-insensitively via raw SQL).
- **Email Module Regression Checklist** — `docs/EMAIL_MODULE_REGRESSION_CHECKLIST.md`, ~40 scenarios across 10 sections (matching rules, idempotency, UI, tracking, compose, deliverability, performance, removed-feature regression, shared history, import cross-check).

### 4.5 Production deployment (completed)

Sequence executed and verified on the production VPS:
1. Database backup (`pg_dump`) — confirmed.
2. `git pull origin main` on the server — fast-forward, all expected files landed.
3. Pre-migration verification (confirmed target columns didn't already exist).
4. Applied migration `20260725000000_add_email_conversation_fields` (adds `Activity.matchedCompanyEmail`, `ccEmail`, `attachments`, plus two indexes — fully additive).
5. Post-migration verification (all 3 columns + both indexes present).
6. Backend deploy: `npm install`, `npx prisma generate` (mandatory — schema changed), `pm2 restart nxt-sales-api`, log check — healthy, stable restart count.
7. Frontend deploy: `npm install`, `npm run build` — clean build.
8. Manual smoke test (Gmail Connect / Sync / Send / Reply / Company History) — user-executed.

Commit for this checkpoint: `9e555e6` — *"feat(email): checkpoint after email module implementation"*.

### 4.6 Known outstanding items (not yet built)

- `messageId` unique DB constraint — verified safe to add (0 duplicates exist), not yet implemented.
- `SyncRun` / `EmailSyncAudit` table for sync provenance/observability — reviewed and designed conceptually, not implemented.
- Cosmetic logging bug: `[Email Sync] ${candidateCount} candidate hit(s) across ${threadIds.size} thread(s)` prints "undefined thread(s)" because `threadIds` is an array, not a Set (`.size` should be `.length`). Not fixed.
- Schema drift: 7 columns exist in the database with no corresponding migration file — `trackingId`, `openCount`, `firstOpenedAt`, `lastOpenedAt`, `openHistory`, `callLogId`, `recordingUrl` (all on `Activity`). Predates this engagement; explicitly deferred by the project owner until after all feature modules are finished.

### 4.7 "Continue Existing Thread" — diagnosed, NOT fixed

Two real bugs were found via code trace (read-only investigation, no code changed):

1. **Unnormalized header matching**: the `emailMode: 'continue'` lookup in `POST /api/email/send` compares `toEmail`/`fromEmail` columns via exact string equality — but those columns are populated from **raw Gmail headers** during sync (can include display names, mixed case, multiple recipients), while every *other* matching site in the same file (`anchorForAddresses`) correctly runs values through `extractAddresses()` first (lowercases, strips display names). This is the one place in the whole module that skips that normalization. Effect: the lookup can silently miss the true latest message and either continue an older thread or start a new one.
2. **`userId`-scoped lookup contradicts the company-centric decision (§4.2)**: the continue-lookup filters `userId: req.user.id`, so if a *different* teammate's mailbox sent/received the most recent message in a thread, the current user's "Continue Existing Thread" won't find it — even though the shared Company History view (deliberately unfiltered by `userId`) shows it as one ongoing conversation.

**Status: unresolved.** Recommended fix (not yet implemented): normalize `toEmail`/`fromEmail` at continue-lookup time via `extractAddresses()`, and either drop the `userId` filter or explicitly redesign continuation to be company/address-scoped rather than user-scoped.

---

## 5. Module: Dynamic Dropdown Management (Update 2)

### Problem
`Industry`, `Country`, and `Lead Status` (Company) plus `Stage`, `Client Type`, `Service Requirement`, `Opportunity Type`, `Strategic Importance`, `Expected Outcome` (Deal) were hardcoded arrays. `Lead Status` specifically was duplicated verbatim across **three files** with no shared source. Every change required a code deploy.

### What was built
- **New model** `DropdownOption` (`fieldKey`, `value`, `label`, `order`, `enabled`) — one generic table for all 9 managed fields, namespaced by `fieldKey` (e.g. `company.industry`, `deal.stage`). `company.country` is shared between Company and Deal forms (same list, not duplicated).
- **Backend** `server/src/routes/dropdowns.js`:
  - `GET /api/dropdowns/:fieldKey` — enabled options, ordered (used by every consuming form/filter)
  - `GET /api/dropdowns` — admin view, all fieldKeys incl. disabled
  - `POST /api/dropdowns` — add a value
  - `PATCH /api/dropdowns/:id` — edit label / enable-disable (`value` itself is immutable once created — renaming it would orphan existing records)
  - `DELETE /api/dropdowns/:id` — hard-deletes only if unused anywhere (checked against both `Company` and `Deal` tables); otherwise returns 409 telling the caller to disable instead
  - `PATCH /api/dropdowns/reorder` — bulk reorder
- **Frontend hook** `client/src/hooks/useDropdownOptions.js` — shared in-memory cache keyed by `fieldKey`, with an `invalidateDropdownOptions()` export so an admin edit reflects immediately in every currently-open form, not just on next page load.
- **Admin UI**: `client/src/pages/settings/DropdownManager.jsx`, linked from a new "Dropdown Lists" section in `Settings.jsx`. Add / inline-rename / enable-disable / reorder (up/down arrows, no drag-and-drop library) / delete (with the safe-delete guard above). Reachable by any logged-in user — no additional role gate was added.
- **Bulk Import** (`ImportModal.jsx`): Industry/Country/Lead Status values are cross-checked against the managed lists; an unmatched value shows a non-blocking advisory warning (⚠) but the import still completes.
- **Seeded from the old hardcoded arrays** via a one-time script (`server/prisma/seed-dropdowns.js`) so nothing regressed on cutover.
- `client/src/constants/formOptions.js` was **deleted** — fully superseded, nothing referenced it after the cutover.

### Database migration
`20260727080000_add_dropdown_options` — new table only, fully additive.

---

## 6. Module: International Phone Input (Update 2, cont'd)

- Added dependency: `react-phone-number-input`.
- Wired into `client/src/components/MultiValueInput.jsx` (the shared repeatable-input component already used for emails/phones/contacts) via a `type === 'tel'` branch — no changes needed in the modals that use it.
- New stylesheet `client/src/styles/phone-input.css` restyles the library's default (unstyled) output to match the app's existing bordered-field look.
- Stored value: plain E.164 string, in the existing `phone`/`phones` columns — no schema change.

---

## 7. Module: Navigation Fix (Update 4)

`client/src/components/layout/Sidebar.jsx` — the logo (previously static markup) is now a `<button>` that calls `navigate('/dashboard')`. Works from every page, since the Sidebar is part of the persistent app `Layout`.

---

## 8. Module: Company Enhancements (Update 5)

### Global search expansion
`server/src/routes/companies.js`, `buildCompanyWhere()` (used by both the paginated list and the CSV/Excel export) and the Recycle Bin's own search block both now also match:
- `phone` (plain column `contains`)
- `linkedProfiles` (a JSONB array — matched via a raw `jsonb_array_elements_text` query, the same pattern already used by the `/email-conflicts` endpoint)

### Pin / Star
- New column `Company.isPinned Boolean @default(false)`.
- `PATCH /api/companies/:id/pin` toggles it.
- Star icon in the Companies table row and on the Company Detail header.
- Companies list now sorts `isPinned desc, createdAt desc`.

### Company Timeline
Confirmed **already fully built** — `client/src/components/activities/ActivityFeed.jsx` (mounted in `CompanyDetail.jsx`) already renders Notes/Calls/Tasks/Meetings/Emails/status-changes chronologically with sub-tabs. No changes were needed; this was explicitly verified rather than rebuilt.

### Database migration
`20260727090000_add_company_pin` — additive.

---

## 9. Module: Dashboard KPIs (Update 6)

### Problem
The old Dashboard computed its 3 stat cards (Total/Active/Won Deals) entirely **client-side** from an unpaginated `GET /deals` fetch — shipping the whole table to the browser just to count rows. Not viable for 6 more KPIs across 4 tables.

### What was built
New endpoint `GET /api/dashboard/stats` (`server/src/routes/dashboard.js`) — 6 parallel DB-side aggregate queries, never a full-table fetch:

| Widget | Source |
|---|---|
| Total Companies | `Company.count()` (excl. Recycle Bin) |
| Deals in Progress | `Deal.count()` where stage not in [Won, Lost] |
| Won Clients This Month | `Deal.count()` where stage = Won, updated this month |
| Calls Today | `Activity(type=call)` count **+** `CallLog` count, combined |
| Follow-ups Due Today | `Activity(type=task)` due today, not completed |
| Tasks Overdue | `Activity(type=task)` due before today, not completed |

`client/src/pages/Dashboard.jsx` — added a second row of 6 stat cards (reusing the existing `.stat-card` styling). The original 3 deal cards, Recent Deals panel, and Quick Actions panel are untouched.

---

## 10. Module: Team Chat (Update 3)

The largest single initiative. Rebuilt from a working-but-basic 1:1 direct-message feature (`ChatMessage` model with `fromUserId`/`toUserId`/`isRead`, 2-second HTTP polling) into a group-capable, real-time messenger — evolved forward, not rewritten from scratch; existing message history was migrated with zero data loss.

Decisions made before implementation:
- **File storage**: local disk (no cloud storage account exists anywhere in this deployment; introducing one wasn't a unilateral call to make).
- **Desktop notifications**: foreground-only, matching the existing `NotificationContext.jsx` browser-`Notification` pattern — not a full service-worker/Web-Push background stack.

### 10.1 E1 — Real-time foundation ✅

- Added `socket.io` (server) + `socket.io-client` (client).
- `server/src/realtime/socket.js` — Socket.io instance attached to the existing HTTP server; JWT-authenticated at handshake (same secret/verification as REST `authMiddleware.js`, no new auth mechanism).
- **Presence**: in-memory `Map<userId, Set<socketId>>` (multi-tab aware — a user only goes "offline" once every socket disconnects). Broadcasts `presence:online` / `presence:offline`; new connections get a `presence:snapshot`.
- **Typing indicators**: ephemeral `typing:start` / `typing:stop` events (no DB).
- `client/src/socket.js` — a lazily-connected shared singleton; wired into `AuthContext.jsx` so it connects on login and disconnects on logout.
- `client/vite.config.js` — added a `/socket.io` dev-proxy entry (with `ws: true`) alongside the existing `/api` proxy.
- Verified with a scripted two-connection test using two real, independently-authenticated sessions: online broadcast, typing start, typing stop, offline broadcast — all confirmed working.

### 10.2 E2 — Group chat schema + data migration ✅

New models:
```prisma
model Conversation {
  id, isGroup, name, createdById, lastMessageAt, lastMessageId, createdAt
  members ConversationMember[]
  messages ChatMessage[]
}
model ConversationMember {
  id, conversationId, userId, joinedAt, lastReadAt
  @@unique([conversationId, userId])
}
```
`ChatMessage` gained (all nullable/additive): `conversationId`, `replyToId`, `editedAt`, `deletedAt`, `pinnedAt`. The original `fromUserId`/`toUserId`/`isRead` columns were **kept**, not dropped — `chat.js` still depended on them at this point.

Migration: `20260728050000_add_conversation_schema`.

**Backfill**: `server/prisma/backfill-chat-conversations.js` — one-time script. Canonicalizes each `(fromUserId, toUserId)` direction-pair into a single conversation (so A→B and B→A messages land in the same conversation, not two), creates the `Conversation`/`ConversationMember` rows, links every existing message, and approximates each member's `lastReadAt` cursor from the old per-message `isRead` flags.

**Verification performed**: confirmed 0 messages left with a null `conversationId` (the required gate before anything downstream could proceed); re-ran the script to confirm idempotency (no duplicate conversations created); regression-checked the *pre-existing* REST endpoints against the new schema (unaffected, since old columns were untouched).

**Deliberately deferred**: dropping `fromUserId`/`toUserId`/`isRead` — doing so before E3 rewrote their consumers would have broken the still-live 1:1 chat feature.

### 10.3 E3 — Group chat UI ✅

- Schema: `ChatMessage.toUserId` relaxed to nullable (migration `20260728060000_chat_message_tounser_nullable`) — a group message has no single recipient.
- `server/src/routes/chat.js` **rewritten** around conversations:
  - `GET/POST /api/chat/conversations` — list (with last-message preview + per-conversation unread count) / create (1:1 via `{userId}`, find-or-create; group via `{name, memberIds}`)
  - `GET/POST /api/chat/conversations/:id/messages`
  - `PUT /api/chat/conversations/:id/read`
  - `GET /api/chat/unread` — rewritten to sum unread across every conversation via each member's read cursor (same response shape as before, so the Sidebar nav badge needed no changes, but now correctly counts group messages too)
  - Old per-user routes (`/messages/:userId`, `/read/:userId`) removed — nothing else referenced them.
  - Every route verifies real conversation membership before allowing access.
- `socket.js` typing events changed from `{toUserId}`-targeted to `{conversationId}`-scoped, with server-side membership verification (a client can't spoof a typing indicator into a conversation it isn't in).
- `client/src/pages/Chat.jsx` **rewritten**: sidebar now lists conversations (not raw teammates) sorted by recent activity, with last-message preview and unread badges; new "+" (start 1:1) and group-icon (Create Group) buttons; a `CreateGroupModal` and `NewChatModal`.
- **Verified end-to-end** with 3 disposable test accounts (created, tested, deleted): 1:1 unread/preview correctness, read-cursor clearing unread, a non-member correctly blocked (403), group creation with correct members/name/unread, group messages correctly having no `toUserId`, live typing-indicator relay to a group member over the socket. Also regression-checked against real historical data.

### 10.4 E4 — Rich messaging ✅

New model `ChatMention` (`messageId`, `userId`) — a join table (not a JSON array) so "messages mentioning me" stays an indexed query. Migration: `20260728070000_add_chat_mention`.

- **Reply**: `replyToId` on send, validated to belong to the same conversation; rendered as an inline quote (sender + snippet) both in the API response and the message bubble.
- **Edit**: author-only, sets `editedAt`, shows "(edited)".
- **Delete**: author-only, **soft delete**. The real body stays in the DB (audit trail — consistent with the `Company.deletedAt` convention elsewhere in this codebase), but every read endpoint redacts it to *"This message was deleted"* at the API boundary — not just hidden client-side, genuinely not sent to other viewers.
- **@Mentions**: client-side autocomplete dropdown while typing `@name` (never fragile free-text parsing) against real conversation members; selections recorded server-side into `ChatMention`, with mentions outside the conversation silently dropped. Rendered bolded in the message bubble.
- **Pinned messages**: any conversation member can pin/unpin; a small pinned-messages panel toggles from the conversation header.

**Verified end-to-end** — 11 checks: reply linkage, invalid `replyToId` ignored gracefully, mention recorded, non-member mention dropped, edit + `editedAt`, non-author edit blocked (403), delete redaction for other viewers, non-author delete blocked (403), pin/unpin toggling, pinned-list contents. All passed. Regression-checked again against real data.

### 10.5 Still pending: E5 and E6

**E5 — File sharing** (not started):
- `POST /api/chat/upload` (multer, local disk under a new `server/uploads/chat/`, served back via `express.static`, read-only)
- **Mandatory validation** (planned, not optional): mime-type allowlist (images, PDF, Word, Excel, generic "other" bucket) + size cap (~25MB, env-configurable)
- `ChatMessage.attachments Json?` — same `{filename, mimeType, size, url}` shape already used for email attachments (`Activity.attachments`), no new pattern
- Image attachments render inline with preview; other types render as filename + type icon + download link

**E6 — Read receipts, search, CRM-record attach, notifications** (not started):
- **Read receipts (Sent/Delivered/Read)**: new `ChatMessageReceipt(messageId, userId, deliveredAt, readAt)` table — needed because a group message has one status *per member*, not a single global flag; populated via the socket layer
- **Message content search**: `body: { contains }` scoped to conversations the user belongs to — simple and sufficient at current scale; Postgres full-text search (`tsvector`) flagged as a future upgrade if it's ever needed, not now
- **Attach a CRM record** (Company/Deal/Note/Document) to a message: `ChatMessage.attachedRecord Json?` storing a `{type, id, label}` snapshot at send time (same JSON-snapshot pattern as `attachments` — no polymorphic foreign key across 4 tables)
- **Desktop notifications**: reuse `NotificationContext.jsx`'s existing `fireDesktop` pattern, triggered by an incoming Socket.io message event instead of the 60-second poll

**Additional recommendations already decided (build into E5/E6, not extra scope)**:
- Rate limiting: a simple in-process per-user token bucket on message send (no new infra)
- Soft-delete only, never hard-delete (already the case as of E4)
- **Explicitly out of scope**: end-to-end encryption — this is an internal team tool behind existing auth; E2E would conflict with server-side search/read-receipts/CRM-attachment, none of which is needed here

---

## 11. Authentication fixes

### 11.1 Forgot Password — built from scratch (was completely missing)

**Root cause**: the "Forgot password?" button on the login page already linked to `/forgot-password`, but **no route, no page, and no backend endpoint existed at all** — clicking it silently bounced back to login.

**What was built**:
- `POST /api/auth/forgot-password` — reuses the *same* token/expiry mechanism already built for invited users (`inviteToken`/`inviteExpires`, and the existing `GET /api/auth/validate-invite` + `POST /api/auth/accept-invite` endpoints) rather than duplicating verify/consume logic. The only genuinely new code is generating and delivering the token.
- Always returns an identical generic response regardless of whether the email matches a real account — **no user-enumeration leak** (verified: real user, unknown email, and missing-field all return the same message).
- Since SMTP isn't configured locally, the dev-mode response includes the reset link directly (mirrors the existing invite-email fallback behavior). With real SMTP configured, the link is **only** ever delivered by email, never returned in the API response.
- New pages: `client/src/pages/ForgotPassword.jsx` (request a reset), `client/src/pages/ResetPassword.jsx` (consume the token — reuses `validate-invite`/`accept-invite` directly, just with reset-specific copy).
- Routes wired in `App.jsx`: `/forgot-password`, `/reset-password`.

**Verified end-to-end** with a disposable test account: old password fails after reset, new password works, the reset link is single-use (replay attempt correctly fails), unknown/missing email doesn't leak or crash. Test account deleted afterward.

### 11.2 Google OAuth `redirect_uri_mismatch`

Encountered while testing a second user session in incognito for Chat testing. **Diagnosed as a pre-existing Google Cloud Console configuration gap — not caused by any code in this engagement.** The app's `.env`-configured `GOOGLE_CALLBACK_URL` (`http://localhost:4000/api/auth/google/callback`) doesn't match whatever's currently registered in that OAuth Client's "Authorized redirect URIs" list in Google Cloud Console.

**Fix (external, not code — the project owner needs to do this in their Google Cloud Console)**: APIs & Services → Credentials → the relevant OAuth 2.0 Client ID → Authorized redirect URIs → add `http://localhost:4000/api/auth/google/callback` (add to the list, don't replace the production entry).

---

## 12. Database schema reference

### Models touched or added this engagement

| Model | Status | Key fields added |
|---|---|---|
| `Activity` | modified (pre-engagement + this engagement) | `matchedCompanyEmail`, `ccEmail`, `attachments` |
| `Company` | modified | `isPinned` |
| `DropdownOption` | **new** | `fieldKey`, `value`, `label`, `order`, `enabled` |
| `Conversation` | **new** | `isGroup`, `name`, `createdById`, `lastMessageAt`, `lastMessageId` |
| `ConversationMember` | **new** | `conversationId`, `userId`, `joinedAt`, `lastReadAt` |
| `ChatMessage` | modified | `conversationId`, `replyToId`, `editedAt`, `deletedAt`, `pinnedAt`; `toUserId` relaxed to nullable |
| `ChatMention` | **new** | `messageId`, `userId` |

### Migrations, in order

1. `20260725000000_add_email_conversation_fields` — Email module (pre-dates the live portion of this session)
2. `20260727080000_add_dropdown_options` — `DropdownOption` table
3. `20260727090000_add_company_pin` — `Company.isPinned`
4. `20260728050000_add_conversation_schema` — `Conversation`, `ConversationMember`, `ChatMessage` additions
5. `20260728060000_chat_message_tounser_nullable` — `ChatMessage.toUserId` nullable
6. `20260728070000_add_chat_mention` — `ChatMention` table

### Known pre-existing schema drift (not from this engagement, explicitly deferred)

7 columns exist on `Activity` in the database with no corresponding migration file: `trackingId`, `openCount`, `firstOpenedAt`, `lastOpenedAt`, `openHistory`, `callLogId`, `recordingUrl`. The project owner's explicit sequencing decision was to address this only after every feature module is finished — do not "fix" this without being asked.

Also: the local dev database's Prisma migration-tracking table (`_prisma_migrations`) is out of sync with the actual schema (tables exist but aren't marked as applied). This is a pre-existing condition, not something introduced this engagement — don't run `prisma migrate dev`/`deploy` to try to reconcile it; every migration this engagement applied was done via hand-authored, idempotent SQL run through `prisma db execute`, exactly to avoid disturbing that pre-existing state.

---

## 13. API reference (new/changed endpoints this engagement)

### Dropdowns
- `GET /api/dropdowns/:fieldKey`
- `GET /api/dropdowns`
- `POST /api/dropdowns`
- `PATCH /api/dropdowns/:id`
- `DELETE /api/dropdowns/:id`
- `PATCH /api/dropdowns/reorder`

### Companies
- `PATCH /api/companies/:id/pin` (new)
- `GET /api/companies` / `GET /api/companies/export` / `GET /api/companies/recycle-bin` — search now also covers `phone` + `linkedProfiles`
- `POST /api/companies/email-conflicts` (pre-dates the live portion of this session, part of the Email module work)

### Dashboard
- `GET /api/dashboard/stats` (new)

### Chat (fully rewritten this engagement)
- `GET /api/chat/users` (unchanged)
- `GET /api/chat/conversations`
- `POST /api/chat/conversations`
- `GET /api/chat/conversations/:id/messages`
- `POST /api/chat/conversations/:id/messages`
- `PATCH /api/chat/conversations/:id/messages/:messageId` (edit)
- `DELETE /api/chat/conversations/:id/messages/:messageId` (soft delete)
- `PATCH /api/chat/conversations/:id/messages/:messageId/pin`
- `GET /api/chat/conversations/:id/pinned`
- `PUT /api/chat/conversations/:id/read`
- `GET /api/chat/unread` (rewritten internals, same response shape)
- ~~`GET /api/chat/messages/:userId`~~, ~~`POST /api/chat/messages`~~, ~~`PUT /api/chat/read/:userId`~~ — **removed**, superseded by the conversation-based routes above

### Auth
- `POST /api/auth/forgot-password` (new)
- `GET /api/auth/validate-invite`, `POST /api/auth/accept-invite` — unchanged, but now dual-purposed for password reset too

### Socket.io events (new transport, not REST)
- `presence:snapshot`, `presence:online`, `presence:offline`
- `typing:start`, `typing:stop` (payload: `{conversationId}`, relayed as `{conversationId, fromUserId}`)

---

## 14. UI/UX changes summary

- Sidebar logo is clickable → Dashboard, from every page
- Settings page gained a working "Dropdown Lists" section (previously all placeholder cards)
- Company/Deal forms: Industry, Country, Lead Status, and all 6 Deal option fields now come from the DB, editable via Settings
- Phone fields across the app show a country-flag selector + auto dial-code
- Companies table + Company Detail: star icon to pin/unpin, pinned companies sort first
- Company search bar now also matches phone numbers and LinkedIn/profile URLs
- Bulk Import preview flags (⚠) any Industry/Country/Lead Status value that doesn't match a managed option, without blocking the import
- Dashboard: 6 new KPI cards below the existing 3 deal cards
- Team Chat: entirely new UI — conversation list (not a flat user list), group creation, reply quotes, inline edit, pinned-messages panel, @mention autocomplete, online/typing indicators
- New pages: Forgot Password, Reset Password

---

## 15. Backup & Restore

Documented separately at **`docs/RESTORE_PROJECT.md`**. Summary:

- **Backup performed this engagement**: code committed (`1416d7a`) and pushed to `origin/main`; full database dump taken via `pg_dump` (custom format) to `C:\Backups\nxt_marketwiz_<timestamp>.dump`, verified valid (90 TOC entries); `server/.env` copied to a `prerequirement` folder alongside the dump and zipped (`C:\Backups\prerequirement.zip`) for secure transfer to a new machine.
- **Restore procedure**: install Node v22.x + PostgreSQL 18 + Git → clone the repo → restore `.env` → `createdb` + `pg_restore` the dump → `npm install` in both `server/` and `client/` → `npx prisma generate` → start both servers. Full step-by-step with exact commands is in `docs/RESTORE_PROJECT.md`.
- **Security note**: the backup zip contains real secrets in plaintext (DB password, JWT secret, Google OAuth client secret, CallHippo API key) — must be transferred via a password manager, encrypted drive, or private cloud folder, never email/chat/public repo.

---

## 16. Consolidated pending work (next steps)

In the order the project owner has been sequencing work (small/contained items first, large efforts last):

1. **Team Chat E5 — File sharing** (multer upload endpoint, local disk storage, mime/size validation, image previews)
2. **Team Chat E6 — Read receipts, message search, CRM-record attachment, desktop notifications**
3. **Email "Continue Existing Thread" bugs** (§4.7) — diagnosed, fix not yet implemented:
   - Normalize `toEmail`/`fromEmail` before the continue-lookup's string comparison
   - Resolve the `userId`-scoped lookup vs. company-centric architecture conflict
4. **Email module Critical items still open**:
   - `messageId` unique DB constraint (verified safe, 0 current duplicates)
   - `SyncRun`/audit-provenance table
5. **Cosmetic**: `threadIds.size` logging bug in `email.js` (should be `.length`)
6. **Schema drift cleanup** — 7 undocumented columns on `Activity` (see §12) — explicitly deferred until all feature modules are finished, per the project owner's own sequencing rule
7. **`docs/RESTORE_PROJECT.md`** — created but not yet committed to git (contains environment-specific paths; owner should decide whether to commit or keep local-only)

---

## 17. Key file reference (by module)

| Module | Backend | Frontend |
|---|---|---|
| Email | `server/src/routes/email.js` | `client/src/pages/EmailTool.jsx`, `EmailConflictWarning.jsx` |
| Dropdowns | `server/src/routes/dropdowns.js` | `useDropdownOptions.js`, `pages/settings/DropdownManager.jsx` |
| Companies | `server/src/routes/companies.js` | `pages/Companies.jsx`, `pages/companies/CompanyDetail.jsx` |
| Dashboard | `server/src/routes/dashboard.js` | `pages/Dashboard.jsx` |
| Team Chat | `server/src/routes/chat.js`, `server/src/realtime/socket.js` | `pages/Chat.jsx`, `client/src/socket.js` |
| Auth | `server/src/routes/auth.js` | `pages/Login.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx` |
| Schema | `server/prisma/schema.prisma` + `server/prisma/migrations/` | — |

---

*This document reflects the state of the project as of the conversation it was generated from. Update it as future work (E5, E6, and beyond) is completed.*
