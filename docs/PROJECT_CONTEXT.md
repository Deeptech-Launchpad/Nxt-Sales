# NXT Sales — Project Context

**Last updated:** 2026-09-09 · **main at:** `df168c2`

Long-form companion to [`../CLAUDE.md`](../CLAUDE.md). Everything here is taken
from the code at that commit, not from recollection.

For history predating this document, see
[`PROJECT_DOCUMENTATION.md`](PROJECT_DOCUMENTATION.md) (written 2026-07-28) —
it covers the earlier engagement in depth and is not repeated here.

No secrets appear in this file. Environment variables are named, never valued.

---

## 1. What this is

An internal CRM for AltiusNXT Technologies' sales team: companies, deals,
activities/tasks, calls, meetings, team chat, email, and a set of AI features
built on Google Gemini. Roughly 15,000 companies in production.

Two AI-adjacent products sit alongside it and are **not** in this repo:

- **Marketing AI Agent** — a separate application that authenticates *into* NXT
  Sales by minting its own JWT with the shared `JWT_SECRET` (see §7).
- **EmotionSense AI** — separate service; `EMOTIONSENSE_URL` is read by the
  server but the product lives elsewhere.

## 2. Repository and machines

| Path | What it is |
|---|---|
| `C:\MaketingWiz\repo` | Git clone. Commit and push from here. |
| `C:\MaketingWiz\project` | Local dev tree — runs the app, has `node_modules` and `.env`. **Not** git-initialized. |
| `~/altius_tools/Nxt_Sales` | Production checkout on VPS `srv1399413`. |

`C:\MaketingWiz\project` also contains unrelated sibling projects
(`EmotionSense_AI_v2`, `Email Tool`). Never copy the whole tree into the clone.

Testing a change means syncing the touched files from `repo` into `project`,
running there, then committing from `repo`.

## 3. Backend

`server/src/index.js` is the composition root. Order matters: line 2 requires
`./config/jwtSecret`, which validates the secret and calls `process.exit(1)` if
it is missing, shorter than 32 chars, or matches a known placeholder
(`dev-secret`, `change-me`, `your-secret`, …). This runs *before* any route,
job or socket module reads the value, which is what makes the removal of the old
`process.env.JWT_SECRET || 'dev-secret'` fallbacks structurally safe.

**Route files (21)** — all mounted under `/api/<name>`:

```
activities  ai        aiUsage    auth       calendar   callhippo
chat        companies customFields  dashboard  dataTransfer  deals
dropdowns   email     enrichmentReports  intelligence  notifications
promptTemplates  prospects  settings   users
```

**Services**

- `geminiService.js` — **the only place the Gemini API key is read and the only
  place a Gemini request is made.** Replaced an earlier arrangement where the
  browser read the key from `localStorage` and called Google directly. Holds a
  model-fallback chain (`gemini-flash-latest`, `gemini-pro-latest`,
  `gemini-2.5-flash`, …) because Google retires pinned model names, caches the
  working model for an hour, and calls `recordUsage` on every success.
  `generate(requestBody, { feature, userId, timeoutMs })` — `timeoutMs` defaults
  to 20s; enrichment passes 120s for multimodal screenshot analysis.
- `aiUsageRecorder.js` — writes `AiUsage` rows from provider-reported usage
  metadata only, never estimates. Feeds the **AI Usage** page.
- `referencePdfGenerator.js` — renders the Product Enrichment Report client PDF
  with `pdfkit`. Shells out to `pdftoppm` (poppler-utils) to rasterise a page
  when the evidence asset is a PDF rather than an image; wrapped in try/catch so
  a missing binary degrades rather than crashes. **Installed in production.**

**Background jobs** — started in `index.js` *after* `app.listen`:
`purgeRecycleBin`, `autoCompleteOverdueTasks`, `callHippoAutoSync`,
`gmailAutoSync`, `followUpSequences`, `scheduledOutreach`.

**Auth** — `middleware/authMiddleware.js` verifies the bearer JWT and populates
`req.user`. Tokens are signed with `expiresIn: '7d'` for humans.

## 4. Data model

22 Prisma models, 42 migrations. Grouped:

| Area | Models |
|---|---|
| Identity | `User` |
| CRM core | `Company`, `Deal`, `Activity`, `FollowUpEnrollment` |
| Calls | `CallLog` |
| Chat | `Conversation`, `ConversationMember`, `ChatMessage`, `ChatMessageReceipt`, `ChatMention` |
| Config | `DropdownOption`, `CustomFieldDefinition`, `CustomFieldValue`, `PromptTemplate` |
| Email | `EmailAccount` |
| AI | `AiUsage` |
| Enrichment | `ProductEnrichmentReport` |
| Outreach | `Prospect`, `ProspectActivity`, `OutreachDraft`, `ScheduledOutreach` |

Notes that have bitten before:

- `Deal.companyId` is **nullable**. Deal counts and company counts therefore
  never reconcile directly — a company can have many deals, and some deals have
  no company at all.
- `Deal.clientType`, `Company.industry`, `Company.country` are free-text
  strings backed by `DropdownOption` rows, not enums or FKs. A value can be
  disabled in Settings while live records still use it.
- `User.settings` (Jsonb) and `User.companyName` were added 2026-09-08 for the
  Settings page. Both nullable, no backfill.
- `User.signatureImage` is `@db.Text` on main — the developer's branch lacks
  that attribute. Keep main's.

## 5. Frontend

Routes are declared in `client/src/App.jsx`. Everything except
login/signup/forgot-password/reset-password/auth-callback/accept-invite sits
behind `<PrivateRoute>` inside `<Layout />`.

`Layout.jsx` renders `TopBar.jsx` for primary navigation. A `Sidebar.jsx` also
exists. **When adding a nav item, check which component Layout actually
renders** — editing the wrong one has cost a deploy cycle.

`client/src/api/client.js` is the single axios instance: `baseURL: '/api'`,
bearer token from `localStorage.mwz_token`, and a 401 interceptor that clears
storage and redirects to `/login` — deliberately skipped for `/email/` and
`/chat/unread`, which surface 401s inline.

`AuthContext.jsx` applies stored appearance preferences
(`localStorage.nxt_appearance` → `data-theme`, `data-density`, `--color-focus`)
on mount, before the Settings page loads.

Two Vite constraints worth remembering:

- Rollup **hard-fails** on importing a non-existent named export, even from
  dead code. `callGeminiWithFallback` from `utils/geminiModel` no longer exists
  and re-appears on every port from the developer's branch — drop the import.
- `position: fixed` is contained by any ancestor with a `transform`. Overlays
  that must escape (e.g. `ThreadDrawer`) use
  `createPortal(…, document.body)`.

## 6. Module status

**Working in production**

Companies (list, detail, recycle bin, custom fields, bulk import/export) ·
Deals (list + Kanban board) · Activities/Tasks · Calls (CallHippo sync) ·
Meetings/Calendar · Team Chat (Socket.io, file attachments) · Email module ·
Dashboard · Deals Dashboard · User Management (invite, deactivate, roles) ·
Settings (Account, Notifications, Security, Integrations, Appearance) ·
Dropdown Lists · Custom Fields · Prompt Templates · AI Usage ·
Customer Intelligence · Product Enrichment Reports · Prospect & Channel Board ·
Single Mail Outreach.

**Pending / blocked**

- **Call Analysis Detail** — `client/src/pages/CallAnalysisDetail.jsx` and
  `styles/call-analysis.css` exist only on the developer's branch. Blocked: they
  expect `POST /callhippo/reanalyze/:id`, which main does not have. Main's
  callhippo surface is `GET /logs`, `POST /sync`, `POST /analyze/:id`,
  `GET /analysis/:id`. The branch also carries
  `server/src/services/geminiCallAnalyzer.js`, not ported. **Explicitly excluded
  by the user pending a separate backend-compatibility review.**
- **`pages/companies/Companies.jsx`** on the developer's branch is a duplicate
  of the companies list. Main deliberately deleted it (`732b94f`) and uses
  `pages/Companies.jsx`. Do not "restore" it.
- **`backfill-company-emails-pass2.js`** — written but never pushed.
- **Marketing AI Agent service user** — created but the agent is still
  configured with a human employee's ID. See §7.

**Known pre-existing issues (not deploy regressions)**

- Gmail API quota exhaustion — `Total Query Cost … units per minute` from
  Google; sync skips threads. Needs a quota increase or a gentler cadence.
- `manoj@altiusnxt.com` has an expired Gmail token (`invalid_grant`); that user
  must disconnect and reconnect Gmail.
- Postgres connection pressure — historical `P2037 remaining connection slots
  are reserved` errors. Each route file constructs its own `PrismaClient`
  rather than sharing one. Was 33/100 in use when last measured; the PM2
  restart counter (44) suggests it has bitten before.
- `email.js` logs occasional "unexpected end of hex escape" errors. Pre-existing;
  inside the frozen module.

## 7. Security posture

**JWT is the whole perimeter.** There are ~28 write routes with no role gating,
so a validly-signed token is full CRM access. Consequences:

- `config/jwtSecret.js` fails the boot rather than accepting a weak secret.
- The secret was rotated to a 96-character value in Sep 2026 after it was
  exposed in a chat message.
- The **Marketing AI Agent** signs its own short-lived tokens with the *same*
  `JWT_SECRET`. That shared secret is effectively a master key — treat any
  change to it as a two-system change.

**Service identity.** `server/scripts/create-service-user.js` creates
`marketingagent@altiusnxt.com` ("Marketing AI Agent", role `member`) with **no
`passwordHash` and no `googleId`**, so it cannot be signed into interactively —
`POST /api/auth/login` rejects accounts without a password hash. The script is
dry-run by default and refuses to modify an existing row. The created user id is
`cmtlgn68v0000elb580hm13qc`.

**Outstanding:** the Marketing AI Agent is still configured with employee
Manikandan's user id (`NXT_SALES_SERVICE_USER_ID` /
`NXT_SALES_LIVE_SERVICE_USER_ID`) and should be repointed to the service user
above. Do not use any human employee account as a service identity.

**Gemini key** never reaches the browser. It is read only by `geminiService.js`.

**Environment variable names** the server reads (values live only in
`server/.env`, which is gitignored):

```
PORT  CLIENT_URL  PUBLIC_URL  JWT_SECRET  DATABASE_URL
GOOGLE_CLIENT_ID  GOOGLE_CLIENT_SECRET  GOOGLE_CALLBACK_URL
GOOGLE_EMAIL_CALLBACK_URL
GEMINI_API_KEY  GEMINI_MODEL  AI_ENABLED
CALLHIPPO_API_KEY  EMOTIONSENSE_URL  CHAT_UPLOAD_MAX_MB
SMTP_HOST  SMTP_PORT  SMTP_USER  SMTP_PASS  SMTP_FROM
```

`CLIENT_URL` must be absolute — a relative OAuth `failureRedirect` produced the
"Cannot GET /login" crash.

## 8. The frontend developer's branch

`origin/Frotend---Devlopement` is a **separate repository history**. Its first
commit is `8a56151`; `git merge-base` against main returns nothing. It cannot be
merged — every integration is file-level porting.

**Auditing it correctly is the hard part, and has gone wrong twice:**

1. `git diff 8a56151..tip` is structurally blind to anything baked into their
   *initial* commit. This hid the entire Settings page for several audits.
2. A directional line-set comparison (only-in-main vs only-in-theirs, CRLF
   normalized) proves files *differ* — **not which side is newer.** The
   developer also uploads directly to `main` via the GitHub web UI ("Add files
   via upload", e.g. `1f234f1`, `a6f75db`, `ade8fe2` on 2026-08-27), so main is
   sometimes ahead on the same file.

**The correct procedure:** for each candidate file, run
`git log --oneline -- <path>` on main. If a direct upload touched it more
recently than the branch's own history, main wins. Then read the actual hunk —
is the type scale going up or down? — rather than trusting counts.

Files where **main is ahead** and must not be overwritten:

| File | Why |
|---|---|
| `jobs/scheduledOutreach.js` | their copy reintroduces the `'dev-secret'` JWT fallback |
| `pages/EnrichmentReports.jsx` | their copy has the build-breaking `callGeminiWithFallback` import |
| `styles/settings.css` | main carries the 2026-08-27 readability pass |
| `pages/settings/DropdownManager.jsx`, `CustomFieldsManager.jsx` | same readability pass |

Roughly 155 of 162 apparent file differences between the trees are **line-ending
only**. Normalize with `sed 's/\r$//'` before comparing anything.

## 9. Deployment

Production is Hostinger VPS `srv1399413`. **Never connect to it.** Produce
commands; the user runs them and pastes output back.

| | |
|---|---|
| Project root | `~/altius_tools/Nxt_Sales` |
| PM2 process | `nxt-sales-api` |
| API port | `8009` |
| Database | PostgreSQL `Nxt_Sales`, user `nxtsales`, `127.0.0.1:5433` |
| DB backups | `~/altius_tools/nxt_sales_db_backup` |

**Production carries local changes that must survive every deploy.** As of
2026-09-08: modified `server/scripts/fix-lead-owner.js` (~140 lines of the
user's own work) and `server/package-lock.json`, plus ~10 untracked operational
scripts and spreadsheets. Before any pull:

```bash
git status --short                 # see what is local
git diff --stat origin/main        # what genuinely differs from the target
```

If `git diff --stat origin/main` lists only the expected incoming files plus the
known local ones, the pull is safe. A fast-forward accepts a staged file whose
content already matches the destination, so stale `git add`s usually clear
themselves. If the pull refuses and names a file, prove that file has **zero**
insertions relative to `origin/main` before restoring it with a path-scoped
`git checkout HEAD -- <path>`.

**Sequence**

```bash
cd ~/altius_tools/Nxt_Sales
TS=$(date +%F-%H%M)

# 1. Back up — database, built frontend, and the current commit
set -a; . server/.env; set +a
pg_dump "$DATABASE_URL" -Fc -f ~/backups/nxtsales-$TS.dump
cp -r client/dist ~/backups/dist-$TS
git rev-parse HEAD > ~/backups/commit-$TS.txt

# 2. Pull
git fetch origin && git pull --ff-only origin main
git diff --name-only <old> <new>          # confirm the file list

# 3. Schema only if a migration is present
cd server
npx prisma migrate deploy                 # NEVER migrate dev
npx prisma generate                       # required before restart

# 4. Restart
pm2 restart nxt-sales-api
pm2 logs nxt-sales-api --lines 40 --nostream

# 5. Frontend only if client/ changed
cd ../client && npm ci && npm run build
ls -1 dist/assets/index-*.css dist/assets/index-*.js

# 6. Verify
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8009/api/<route>
```

**Rollback:** `git checkout $(cat ~/backups/commit-<TS>.txt)`, `npx prisma
generate`, `pm2 restart nxt-sales-api`, and restore `client/dist` from the
backup. Additive nullable columns can stay — dropping them is riskier than
leaving them.

**Lessons paid for**

- Omitting `npx prisma generate` after a schema change → 500s across the API.
- A `curl` immediately after `pm2 restart` returns `000` because it races the
  listener. Retry before diagnosing.
- Bundle hashes are content-addressed and reproduce across machines. Building
  the same commit locally and comparing `index-*.js` / `index-*.css` is the
  cheapest proof a frontend deploy actually landed.
- Filtering a change set to `.js/.jsx/.json/.prisma` silently drops `.css` and
  breaks the build. Build from a clean checkout of the branch, not a filter.

## 10. Business rules worth knowing

- **Deleting a user** is blocked by FK constraints when they own Deals,
  Conversations or Activities (Prisma `P2003`). The API catches this and
  suggests Deactivate. That is intended behaviour, not a bug.
- **Dropdown values in use** cannot be deleted (`isValueInUse` guard) but *can*
  currently be disabled with no warning. A disabled value still renders in edit
  modals as "<value> (no longer in list)" so existing records are not corrupted.
- **Company filters** match `mode: 'insensitive'` on country; industry has had
  case-sensitivity bugs.
- **Enrichment reports** validate evidence before generating a client PDF:
  before/after assets must both exist and differ, and product identity must be
  verified. A validation rejection is the feature working, not an error.
- **Customer Intelligence** builds from CRM data, website/PDP content and email
  conversation summaries (`GET /intelligence/email-summaries/:companyId`). It
  has no call-data source. Its prompt is owner-supplied and marked "DO NOT
  REWRITE" — Section 6 (`### Summary` / `### Sales Outreach Pitch`) is the only
  part that has been authorised for change.
- **Appearance** preferences are validated server-side and clamped to allowed
  values (`theme` light|system, `density` comfortable|compact, `accent`
  navy|blue|red).

## 11. Decision log

| Date | Decision |
|---|---|
| 2026-08 | Gemini centralised server-side in `geminiService.js`; browser-side key use removed. |
| 2026-08 | Email module declared FIXED/FROZEN. |
| 2026-09-08 | JWT hardening: all five `'dev-secret'` fallbacks removed, boot-time validator added, secret rotated to 96 chars after chat exposure. |
| 2026-09-08 | Dedicated non-loginable service user created for the Marketing AI Agent instead of reusing an employee account. |
| 2026-09-08 | Settings shipped as a full-stack feature — `routes/settings.js`, one mount, and the additive `User.settings` / `User.companyName` migration — after establishing it could not work frontend-only. |
| 2026-09-08 | Enrichment backend ported, but its Gemini calls rewired through `geminiService` rather than the branch's direct `@google/genai` use, so AI Usage keeps recording. Side effect: `@google/genai` is *not* a dependency. |
| 2026-09-08 | `services/pdfReportGenerator.js` not ported — unreferenced on the developer's branch too. |
| 2026-09-08 | Customer Intelligence provenance line collapsed behind an "AI Details" toggle. |
| 2026-09-08 | Duplicate-company warning moved inline under the Company URL field. |
| 2026-09-09 | This document and `CLAUDE.md` created. |

**Mistakes worth not repeating** (all real, all cost a cycle):

- Ported two Settings subpages "from the branch" and silently reverted the
  developer's readability pass, because the audit proved difference rather than
  direction. Reverted in `74fe7db`.
- Added nav items to `Sidebar.jsx` when `Layout.jsx` renders `TopBar.jsx`.
- Copied a stale `modal.css` over the repo's and nearly reverted 22 developer
  CSS rules.
- A formatter mangled a template literal into
  `` `/ intelligence / email - summaries / ${company.id} ` ``; the 404 was
  swallowed by `.catch(() => ({ ok: false }))` and surfaced as "no synced
  email". Fixed in `39873d7`. Check URLs, not just prompt strings, after
  formatter damage.
- Wrote probe scripts into `server/`, where `nodemon` watches `*.*` — the
  restarts produced phantom test failures twice.
