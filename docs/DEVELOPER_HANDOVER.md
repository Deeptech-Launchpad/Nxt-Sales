# Developer Handover Guide — NXT Sales

Welcome. This document is written for someone who has **never seen this codebase before** and needs to understand it, run it, and safely make changes — without needing to ask the previous developer.

It's written in plain language on purpose. For dense technical reference (exact line numbers, migration history, known gotchas), see [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) and the root [`CLAUDE.md`](../CLAUDE.md) — this guide is the friendly front door to those.

**No secrets appear anywhere in this file.** Every credential is referred to by its variable *name* only, never its value.

---

## 1. What this project is

**NXT Sales** (internal code name `nxt-marketwiz`) is an internal CRM for AltiusNXT Technologies' sales team. Think of it like a lightweight, custom-built HubSpot. It tracks:

- **Companies** — the clients/prospects the sales team is working on (~15,000 in production)
- **Deals** — sales opportunities tied to a company
- **Activities** — a shared timeline per company: emails, calls, tasks, meetings, notes
- **Calls** — synced automatically from a phone/dialer service called CallHippo
- **Team Chat** — internal messaging between employees
- **Email** — send and receive real Gmail messages right inside the CRM, with each conversation automatically filed under the right company
- **AI features** — company "intelligence" summaries, product enrichment reports, email drafting help — all powered by Google's Gemini AI

Two related products are **not** inside this repository, but this app talks to them:
- **Marketing AI Agent** — a separate app that logs into NXT Sales using its own token (see §12, Security).
- **EmotionSense AI** — a separate Python service (lives in the sibling folder `EmotionSense_AI_v2`) that analyzes the *emotional tone* of recorded sales calls.

---

## 2. How it's built (the big picture)

```
 Your browser
      │
      ▼
 React app (client/)  ──calls /api/...──▶  Express API (server/)  ──▶  PostgreSQL database
      │                                           │
      │                                           ├──▶  Gmail (send/receive real email)
      │                                           ├──▶  Google Calendar (schedule meetings)
      │                                           ├──▶  Google Gemini (AI features)
      │                                           ├──▶  CallHippo (phone call history)
      │                                           └──▶  EmotionSense (call sentiment — separate service)
      │
      └── Socket.io (only for "who's online" / typing indicators in Team Chat)
```

- **Frontend:** React 18 + Vite. Lives in `client/`.
- **Backend:** Node.js + Express. Lives in `server/`.
- **Database:** PostgreSQL, accessed through an ORM called Prisma (Prisma lets you describe your database tables in one file, `server/prisma/schema.prisma`, instead of writing raw SQL everywhere).
- **Login:** Either an email+password (JWT token) or "Sign in with Google."
- **Background jobs:** Six small programs that wake up on a timer to do housekeeping — sync new emails, sync new calls, send scheduled outreach, clean up old data, etc. (full list in §6).

---

## 3. Folder structure

```
project/
├── client/              React frontend
│   └── src/
│       ├── pages/        One file per screen (Dashboard, Companies, Inbox, Chat, Settings, ...)
│       ├── components/   Reusable building blocks (modals, filters, shared widgets)
│       ├── api/client.js The ONE place that talks to the backend (axios)
│       ├── context/      App-wide state (who's logged in, notifications)
│       ├── hooks/        Reusable bits of logic (e.g. "load dropdown options")
│       └── utils/        Small helper functions
│
├── server/               Express backend
│   └── src/
│       ├── routes/        21 files — one per feature area, e.g. companies.js, email.js, deals.js
│       ├── jobs/          6 background timers (see §6)
│       ├── services/      Gemini AI, PDF generation, usage tracking
│       ├── config/        JWT secret validation, Google login setup
│       └── middleware/    Checks the login token on every request
│   └── prisma/
│       ├── schema.prisma  The database blueprint — every table and its columns
│       └── migrations/    43 numbered scripts that built the database step by step over time
│
├── docs/                  This file, PROJECT_CONTEXT.md, and the email regression checklist
├── README.md              Quick local setup instructions
├── CLAUDE.md              Short working rules (also used by AI coding assistants)
│
├── EmotionSense_AI_v2/   A DIFFERENT project (call sentiment analysis) — not part of this app
└── Email Tool/            A DIFFERENT, standalone project — not part of this app
```

Two sibling folders, `EmotionSense_AI_v2` and `Email Tool`, sit next to this project on disk but are **separate codebases**. Don't copy them into a fresh clone.

---

## 4. The database, in plain English

Prisma's `schema.prisma` file defines **22 tables** (called "models"). Here's what each one really means:

| Table | What it actually is |
|---|---|
| `User` | A team member's login (sales rep, admin) |
| `Company` | A client/prospect business |
| `Deal` | A sales opportunity tied to a company |
| `Activity` | One entry in a company's timeline — an email, call, task, meeting, or note |
| `CallLog` | A phone call pulled in from CallHippo, with optional AI sentiment analysis |
| `EmailAccount` | One employee's connected Gmail mailbox (holds their OAuth tokens — see §8) |
| `Conversation`, `ConversationMember`, `ChatMessage`, `ChatMessageReceipt`, `ChatMention` | Internal Team Chat |
| `DropdownOption` | An admin-editable value for a dropdown (e.g. the list of industries) |
| `CustomFieldDefinition`, `CustomFieldValue` | Admin-added extra fields on Companies/Deals |
| `PromptTemplate` | An editable AI prompt/email template |
| `AiUsage` | One row per AI call made anywhere in the app, for cost tracking |
| `ProductEnrichmentReport` | A generated client-facing PDF report |
| `Prospect`, `ProspectActivity`, `OutreachDraft`, `ScheduledOutreach` | The cold-outreach "Prospect Board" feature |
| `FollowUpEnrollment` | Tracks an automated follow-up sequence running for one company |

**How the pieces connect:** A `Company` has many `Activity` rows, many `Deal` rows, and many `CallLog` rows. Every `Activity` belongs to one `Company` (unless it's unfiled) and was created by one `User`. Every `EmailAccount` belongs to exactly one `User` — each employee connects their own personal mailbox.

**Fields that hold secrets** (never print these, even for debugging): `User.passwordHash`, `User.inviteToken`, `EmailAccount.accessToken`, `EmailAccount.refreshToken`.

**Migration history:** 43 migration folders, dated 2026-06-18 through 2026-09-24. Each one is a small, additive change (add a column, add a table) — nobody has ever reset the database and started over, so the full history is intact and safe to replay on a fresh machine.

---

## 5. Running it locally

Full step-by-step setup is in the root [`README.md`](../README.md) — install dependencies, create a Postgres database, copy `.env.example` to `server/.env`, run `npx prisma generate` and `npx prisma db push`, then `npm run dev`.

A few things worth knowing that aren't obvious from the README:

- **Local backend must run on port 4000**, not the code's own default of 5000 — the frontend's dev server expects it there. Always set `PORT=4000` in `server/.env`.
- **`server/.env` is never committed** (it's in `.gitignore`). You create it yourself from `.env.example`.
- If you ever see `Cannot find module '.prisma/client/default'` — you need to run `npx prisma generate` inside `server/`. This regenerates Prisma's auto-generated database client code, which isn't tracked in git.
- `nodemon` (the tool that auto-restarts the backend when you save a file) watches **everything** under `server/`, including stray test scripts. If you're writing a one-off test file, keep it outside `server/` or the backend will keep restarting mid-test.
- There is currently **no automated test suite**. One manual script exists (`server/tests/deactivatedUserJobs.test.js`) that you run by hand with `node`, but there's no Jest/Vitest/Mocha configured anywhere in the project. If you add tests, you're setting up the framework from scratch.

---

## 6. Background jobs (the six timers)

These start automatically when the backend boots. Each one wakes up, does its job, and goes back to sleep.

| Job | What it does | How often |
|---|---|---|
| **Gmail auto-sync** | Checks every connected mailbox for new email and files it under the right company | Every 10 minutes |
| **CallHippo auto-sync** | Pulls in new phone calls | Every 10 minutes |
| **Follow-up sequence sweep** | Advances each active automated follow-up sequence, creating the next task | Every 15 minutes |
| **Auto-complete overdue tasks** | Marks certain tasks as done once their due date has passed | Every 15 minutes |
| **Recycle bin purge** | Permanently deletes companies that have been in the recycle bin for 30+ days | Every 6 hours |
| **Scheduled outreach sender** | Sends queued cold-outreach emails that are due | Every 30 seconds |

---

## 7. API routes, by feature

All 21 route files are mounted under `/api/...`. One sentence each:

| Mounted at | Handles |
|---|---|
| `/api/auth` | Login, signup, invites, password reset, Google sign-in |
| `/api/companies` | Company list, detail, import/export, recycle bin |
| `/api/deals` | Sales deals and pipeline stages |
| `/api/activities` | The timeline items on a company (emails, calls, tasks, meetings, notes) |
| `/api/email` | Gmail connection, sending, syncing — the whole email feature (see §8) |
| `/api/calendar` | Scheduling meetings, creating Google Meet links |
| `/api/callhippo` | Phone call sync and sentiment analysis |
| `/api/chat` | Team chat |
| `/api/notifications` | The notification bell's contents |
| `/api/dropdowns` | Admin-managed dropdown values |
| `/api/custom-fields` | Admin-defined extra fields |
| `/api/dashboard` | The home screen's "what to do next" list |
| `/api/ai` | The one shared endpoint every AI feature calls through |
| `/api/ai-usage` | AI usage/cost reporting |
| `/api/prompt-templates` | Editable AI prompt templates |
| `/api/data` | Import/export for calls, inbox, and tasks |
| `/api/intelligence` | Gathers context (website content, DNS checks) for the AI "Customer Intelligence" feature |
| `/api/enrichment-reports` | Generates client-facing product enrichment PDFs |
| `/api/prospects` | The cold-outreach Prospect Board |
| `/api/users` | Admin user management (invite, deactivate) |
| `/api/settings` | Per-user preferences and Gmail connection status |

---

## 8. Gmail integration — how email really works

This is the most complex part of the app, so it gets its own section. **This module is frozen — see §12 before changing anything here.**

### 8.1 Gmail API, not SMTP — with one exception

The CRM's actual email feature (composing, sending, and syncing conversations with clients) talks **directly to the Gmail API**, not a generic SMTP server. There's no "mail server" involved for client email.

The one exception: a separate, unrelated piece of the app sends **system emails** (password-reset links, team invites) through plain SMTP, using the `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_PORT` / `SMTP_FROM` settings. This is completely separate code from the Gmail feature — don't confuse the two when troubleshooting.

### 8.2 One Google "app," three different jobs

In Google Cloud Console, you register one **OAuth client** (one Client ID + Client Secret) for the whole app. This project reuses that *same* Client ID and Secret for three different purposes:

1. **"Sign in with Google"** — logging into the CRM itself
2. **Connecting your Gmail mailbox** — so the CRM can send/receive on your behalf
3. **Google Calendar** — so meetings can get a real Google Meet link

Each of these three uses a different **callback URL** (the page Google sends you back to after you approve access):

| Purpose | Env var | Default if unset |
|---|---|---|
| Sign in with Google | `GOOGLE_CALLBACK_URL` | `http://localhost:5000/auth/google/callback` |
| Connect Gmail *and* Calendar | `GOOGLE_EMAIL_CALLBACK_URL` | `http://localhost:5000/api/email/gmail/callback` (Gmail only — Calendar has **no fallback** and will break if this isn't set) |

**If you ever see a `redirect_uri_mismatch` error from Google:** figure out which of the three flows failed, then check that the matching env var above is set to a URL that is (a) actually reachable and (b) listed *exactly* (protocol, host, and path) under "Authorized redirect URIs" in the Google Cloud OAuth client settings.

### 8.3 How an employee connects their own Gmail

Each employee connects their *own* Gmail account from their **Settings page** inside the CRM. Behind the scenes:

1. The CRM asks Google for a "consent" link, requesting permission to: send email, read email, and manage calendar events on the employee's behalf.
2. The employee is sent to Google, approves access, and is redirected back.
3. The CRM exchanges that approval for an access token and a refresh token, looks up which Gmail address was just approved, and saves it.

Nothing is shared between employees — everyone connects their own mailbox, and the CRM only ever acts as that specific person when sending or reading their mail.

### 8.4 Where the tokens are stored

Each connected mailbox is one row in the `EmailAccount` table: the Gmail address, an access token, and a refresh token.

**Important, plainly stated:** these tokens are stored as regular text in the database — there is no extra encryption layer on top of normal database security. This is worth knowing if you're ever thinking about database backups, exports, or who has read access to the production database.

When an access token expires, Google issues a new one automatically and the app saves it back to the same row — this happens quietly in the background, you don't need to do anything.

### 8.5 How syncing new email works

A background job checks every connected mailbox every 10 minutes for anything new from the last 2 days. The very first time a mailbox is connected, it also does one much bigger one-time sweep of the entire mailbox history (this is only ever done once per mailbox, so it won't repeat itself after a server restart).

Each incoming email is matched to the right company by comparing the sender/recipient address against the company's saved email address — and the system is careful not to file the exact same real email twice, even if it shows up in more than one employee's inbox.

### 8.6 Conversation grouping

Multiple messages that are part of the same back-and-forth are grouped together using Gmail's own "thread ID," so a 5-message email exchange shows up as one conversation, not five separate entries.

---

## 9. Gemini AI integration

### 9.1 What it's used for

Three things call Gemini today: **Customer Intelligence** (AI company summaries), the **Email Tool** (AI-assisted email drafting and a deliverability check), and **Product Enrichment Reports** (AI-generated before/after product comparisons).

### 9.2 Where the key lives

The key is read from one environment variable, `GEMINI_API_KEY`, in exactly one file: `server/src/services/geminiService.js`. **It never reaches the browser** — every AI request goes through the backend. There's also `AI_ENABLED` (turns AI off without deleting the key) and `GEMINI_MODEL` (an optional preferred-model override).

### 9.3 Model fallback, explained simply

Google occasionally retires specific model names. Instead of hard-coding one model, the app tries a priority list of models in order (newest/fastest first) and automatically moves to the next one if a model is unavailable or rate-limited. Whichever model actually works gets remembered for an hour, so most requests don't need to "search" for a working model every time.

### 9.4 Is there an admin screen to change the key?

There's a backend capability for it (an admin-only API endpoint that can update the key directly in `server/.env`), but **no screen in the app currently uses it.** Today, changing the Gemini key means editing `server/.env` by hand and restarting the server — there's no "rotate key" button for an admin to click yet.

### 9.5 Usage and cost tracking

Every successful AI call is logged — which feature used it, which model, and the exact token counts Google reports back. The in-app "AI Usage" page then estimates a dollar cost from those token counts using a built-in price table; the dollar amount itself isn't stored, just calculated live when you view the report.

---

## 10. Other integrations

### 10.1 Google Sign-In (logging into the CRM)
Lets someone log in with their Google account instead of a password. On first login it either links to an existing account with a matching email, or creates a brand-new user. Reuses the same Google Client ID/Secret as the Gmail feature (see §8.2), but its own callback URL.

### 10.2 Google Calendar / Google Meet
When scheduling a meeting in the CRM, it can create a real Google Calendar event with an automatic Google Meet video link attached. Uses the same Google OAuth client as the Gmail feature. If Gmail isn't connected, meetings still get saved — they just won't have a Meet link.

### 10.3 CallHippo (phone system)
CallHippo is the team's phone/dialer service. The CRM pulls in call history and recordings automatically every 10 minutes using `CALLHIPPO_API_KEY`.

### 10.4 EmotionSense (call sentiment analysis)
A separate, in-house Python service (not a paid third party) that listens to downloaded call recordings and reports the emotional tone of the conversation. Configured with `EMOTIONSENSE_URL`, defaults to `http://localhost:8000` for local development.

---

## 11. Environment variables — the full list

Create `server/.env` from `.env.example`. Below are every variable name the backend actually reads from code, grouped by purpose. **Values are never shown here — only names.**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signs login tokens — the server refuses to start if this is missing, too short, or a known placeholder |
| `PORT` | Backend port (**must be 4000 locally**) |
| `CLIENT_URL` | The frontend's URL, used for redirects after login |
| `PUBLIC_URL` | A publicly-reachable URL, needed for email "opened" tracking to work |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Shared by all three Google OAuth flows (see §8.2) |
| `GOOGLE_CALLBACK_URL` | Callback for "Sign in with Google" |
| `GOOGLE_EMAIL_CALLBACK_URL` | Callback for connecting Gmail and for Calendar |
| `GEMINI_API_KEY` | The Gemini AI key |
| `GEMINI_MODEL` | Optional: force a specific model instead of the fallback list |
| `AI_ENABLED` | Optional: turn AI features off entirely |
| `CALLHIPPO_API_KEY` | CallHippo phone sync |
| `EMOTIONSENSE_URL` | Address of the call-sentiment-analysis service |
| `CHAT_UPLOAD_MAX_MB` | Max file size for Team Chat attachments |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | System emails only (password reset, invites) — unrelated to the Gmail feature |

`.env.example` in the repo root has been refreshed to list all of the above as placeholders.

---

## 12. Modules you must not change without approval

**The Email module is frozen.** This includes:
```
server/src/routes/email.js
server/src/jobs/gmailAutoSync.js
client/src/pages/EmailTool.jsx
client/src/pages/Inbox.jsx
client/src/components/activities/  (email rendering)
```
Reading this code is always fine. Changing it is not, without explicit sign-off — this area has broken in subtle, hard-to-notice ways before (duplicate emails, truncated messages), and any change here must pass `docs/EMAIL_MODULE_REGRESSION_CHECKLIST.md` first.

**The `Frotend---Devlopement` git branch must never be merged.** It's a completely separate, unrelated commit history (not a normal feature branch) — bringing in changes from it means copying individual files by hand, never a `git merge`.

**Security secret:** `JWT_SECRET` is shared with the separate Marketing AI Agent application — changing it breaks login for both systems at once, not just this one.

---

## 13. Known issues worth knowing about

- **Gmail API rate limits** — Google occasionally throttles the app ("quota exceeded") when syncing many mailboxes at once; affected syncs just skip and retry next cycle.
- **One employee's Gmail token has expired** (`manoj@altiusnxt.com`) — they need to disconnect and reconnect Gmail from Settings.
- **Database connections run a little hot** — most backend files each create their own database connection instead of sharing one. It hasn't caused an outage, but it's worth knowing if you ever see "too many connections" errors.
- **No automated tests** — see §5. Any change should be manually verified against a real local database before committing.

---

## 14. Git workflow

- The real working clone for commits is `Nxt-Sales-git` on this machine (check with your local setup — the exact path can vary by machine). Always check `git status` and `git log --oneline -5` before assuming you're in the right place.
- Normal work happens on `main`. Branch from `origin/main`, not a possibly-stale local copy.
- There is a separate, legacy frontend-developer branch (`Frotend---Devlopement`) with its own unrelated history — see §12, never merge it.
- Before pushing, always run `git diff --stat` to see exactly what changed, and double-check nothing secret got staged (`git status` after `git add`, then look at the actual file contents if anything looks unexpected).
- Commit messages should explain *why*, not just *what* — the codebase has been bitten before by changes whose reasoning wasn't recorded.

## 15. Deployment (short version)

The exact, already-proven command sequence lives in [`PROJECT_CONTEXT.md` §9](PROJECT_CONTEXT.md#9-deployment) — back up the database and build output first, pull, rebuild, and verify by comparing bundle file-name hashes between a local build and what's actually live. Production deploys are run by a human pasting commands one at a time; nobody connects to the production server directly or automatically.

---

## 16. Security rules, summarized

- Never commit `server/.env`, OAuth secrets, API keys, access/refresh tokens, database credentials, or production database dumps. `.gitignore` already excludes `.env` files — verify this hasn't changed before any commit that touches configuration.
- When documenting or discussing configuration, use variable **names** only, never values.
- The Gmail/Calendar/Google-Sign-in tokens in the database are plain text (§8.4) — treat database backups and exports with the same care as you'd treat a password file.
- Every write-capable route trusts a valid login token with no extra role checks in most places — a logged-in account effectively has broad access. Don't treat "logged in" and "authorized for this specific action" as the same thing when adding anything sensitive.

---

## 17. New developer onboarding checklist

**Accounts and access someone needs to grant you:**
- [ ] GitHub access to `https://github.com/Deeptech-Launchpad/Nxt-Sales`
- [ ] A `server/.env` file (or the values to fill one in yourself) — ask the project owner, don't guess
- [ ] If you'll work on AI features: confirmation of who manages the Gemini API key (see §18 — currently unconfirmed)
- [ ] If you'll work on email features: confirmation of who manages the Google Cloud OAuth project (see §18 — currently unconfirmed)
- [ ] Production server access, if you'll ever need to run deploy commands yourself

**Local setup:**
- [ ] Clone the repo, run `npm run install:all`
- [ ] Create a local PostgreSQL database
- [ ] Copy `.env.example` to `server/.env`, fill in real values
- [ ] `cd server && npx prisma generate && npx prisma db push`
- [ ] `npm run dev` from the repo root, confirm both `http://localhost:3000` and `http://localhost:4000` respond

**Verify the integrations work, safely:**
- [ ] Log in, go to Settings, try connecting a Gmail account — if it redirects correctly and the connection shows as active, Gmail OAuth is configured correctly
- [ ] Try any AI feature (e.g. open a company's Customer Intelligence tab) — if it returns a real response, the Gemini key is working
- [ ] Don't test by sending real email to real customers — use a test mailbox or your own inbox

**Before your first commit:**
- [ ] Read §12 (frozen modules) so you know what needs explicit approval first
- [ ] Run `git diff --stat` and `git status` before every commit
- [ ] Test the change manually against a real local database — there's no automated suite to catch mistakes for you

**Before any deploy:**
- [ ] Follow the exact sequence in `PROJECT_CONTEXT.md` §9 — back up first, always

---

## 18. Account ownership, and other open items

### 18.1 Account ownership — confirmed by the project owner

None of this is visible in the source code — the code only contains opaque configuration values (client IDs, API keys), which never reveal *who* owns the underlying Google account or Cloud project. The five items below were previously listed as `NEEDS CONFIRMATION`; the project owner has since confirmed each one directly. That confirmation is recorded here as the owner's statement — it has not been independently re-verified by inspecting Google Cloud Console or Google AI Studio directly, since this guide is written from the codebase, not from access to those consoles.

| Claim | Status |
|---|---|
| The Gemini API key was created from the Google account `itsupport@altiusnxt.com` | **CONFIRMED** (project owner) |
| The Gemini API key was created under the project named **"Audio To text Converter and Nxt Sales"** | **CONFIRMED** (project owner) |
| The Google Cloud OAuth client used for Gmail, Google Calendar, and Google Sign-In (see §8.2) is configured under the Google account `dtlpsaranya@gmail.com`, in the project **"NXT MarketingWiz"** (`nxt-marketingwiz`) | **CONFIRMED** (project owner) |
| The Gemini key's project and the OAuth client's project are the same underlying project setup — not two separate projects, despite the two different names above | **CONFIRMED** (project owner) |

**Important distinction, still worth stating plainly:** `dtlpsaranya@gmail.com` is the Google account that **manages the Google Cloud Console OAuth configuration** for NXT MarketingWiz — it is an administrative/console-access account, not a mailbox connected inside NXT Sales for sending or receiving a specific employee's email. Do not describe it as, or treat it as, an employee's connected Gmail mailbox unless that is separately and explicitly verified — those are two genuinely different roles (see §8.2-8.3 for how an individual employee's own Gmail connection works, which is unrelated to who manages the Cloud Console project).

On the Gemini/OAuth project relationship: the project owner has confirmed these are the same project setup. The two names above ("Audio To text Converter and Nxt Sales" for Gemini, "NXT MarketingWiz" / `nxt-marketingwiz` for the OAuth client) are recorded here exactly as provided — this guide does not rename, reconcile, or otherwise alter either name, and does not speculate about why one underlying setup carries two different labels.

### 18.2 Still open

Carried over from `PROJECT_CONTEXT.md`, not resolved by this update:
- The Marketing AI Agent service account exists but is still configured with a human employee's user ID rather than its own dedicated service identity — needs to be repointed.
