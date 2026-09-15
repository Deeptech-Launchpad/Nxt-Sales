# NXT Sales CRM — working notes for Claude

Internal CRM for AltiusNXT Technologies. Internal package name `nxt-marketwiz`;
the product is called **NXT Sales**.

Read this file first. The long-form architecture, decision history and module
status live in [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) — read that
before any non-trivial change.

---

## Stack and layout

| | |
|---|---|
| Backend | Node.js + Express, `server/src/`, PostgreSQL via Prisma |
| Frontend | React 18 + Vite, `client/src/` |
| Auth | JWT (email/password) + Google OAuth via Passport |
| Real-time | Socket.io (`server/src/realtime/socket.js`) |
| AI | Google Gemini, server-side only, via `server/src/services/geminiService.js` |
| Process manager | PM2, process name `nxt-sales-api` |
| Remote | `https://github.com/Deeptech-Launchpad/Nxt-Sales.git`, branch `main` |

```
server/src/routes/       21 route files, mounted in server/src/index.js
server/src/services/     geminiService, aiUsageRecorder, referencePdfGenerator
server/src/jobs/         6 background sweeps, started in index.js after listen()
server/src/config/       jwtSecret.js (boot-time validator), passport.js
server/prisma/           schema.prisma (22 models), migrations/ (42)
client/src/pages/        page components; routes declared in client/src/App.jsx
client/src/components/   layout/, modals/, activities/, filters/
client/src/api/client.js axios instance, baseURL /api, token from localStorage
```

## Running locally

```bash
npm run install:all          # root + client + server
npm run dev                  # client :3000 and server together
```

Vite proxies `/api`, `/socket.io` and `/uploads` to `http://localhost:4000`, so
**the local server must be on port 4000** (set `PORT` in `server/.env`).
Production uses `8009`. The code's own default is 5000 — always set `PORT`.

`server/.env` is gitignored and never committed. Env var *names* the server
reads are listed in `docs/PROJECT_CONTEXT.md`; values live only on the machine.

---

## Hard rules

**1. The Email module is FROZEN.** Do not modify email sending, Gmail sync,
message/company matching, threading, or the Activities email flow. This covers
at minimum:

```
server/src/routes/email.js          (~1990 lines)
server/src/jobs/gmailAutoSync.js
client/src/pages/EmailTool.jsx
client/src/pages/Inbox.jsx
client/src/components/activities/   (email rendering / ThreadDrawer)
```

If a change appears to require touching these, stop and ask. Reading them is
fine; a change is not. `docs/EMAIL_MODULE_REGRESSION_CHECKLIST.md` must pass
before any email-adjacent commit.

**2. Never print, log, commit or paste a secret.** No `JWT_SECRET`,
`GEMINI_API_KEY`, `DATABASE_URL` password, OAuth client secret, or SMTP
password — not into chat, not into a commit, not into a file. When a command
needs the DB, read it live from `server/.env` rather than inlining a password.

**3. Never access the production server directly.** No SSH, no remote psql, no
API calls against it. Produce copy-paste commands for the user to run. This is
absolute unless the user asks for that specific action in that specific
conversation.

**4. Never run destructive git commands** — `git reset --hard`, `git clean -fd`,
`rm -rf` — without explicit approval. Production carries untracked and locally
modified files that are real work (see PROJECT_CONTEXT §Deployment). Use
path-scoped `git checkout -- <path>` instead, and only after proving the
discarded content is not unique.

**5. Do not merge the `Frotend---Devlopement` branch, or any other developer's
branch.** As of 2026-09-15 the user is the sole code owner — there is no other
active contributor to assume changes from or merge on behalf of. This branch
specifically is also an *unrelated history* (its own initial commit;
`git merge-base` with main is empty). All integration is file-level porting,
never a merge, and never unattended — see rule 8.

**6. The branch is not always ahead of main.** Historically the (now former)
frontend developer sometimes uploaded directly to `main` via the GitHub web UI
("Add files via upload") rather than through the branch. If porting any file
whose history predates 2026-09-15, still run `git log --oneline -- <path>` on
main first; if a direct upload touched it more recently, **main wins**. Confirm
by reading the actual hunk, never by line counts. This has caused a real
regression — see PROJECT_CONTEXT §Decisions. For anything after 2026-09-15,
`main` is unconditionally the single source of truth — there is no competing
upload path left to reconcile against.

**7. Every change is scoped to exactly what was asked.** Make the smallest
change that fixes the reported issue; do not refactor unrelated code, rename
things in passing, or "clean up" nearby code that wasn't part of the request.
Preserve all existing working functionality — a fix must not become a
redesign. When a request says "frontend only" or "do not modify the backend",
honour that scope for the current conversation only; do not carry a previous
grant forward into a later one.

**8. Never blindly merge or push to `main`.** Before every merge and every
push — no exceptions, no matter how small the change looks —:
- Run `git status`, `git diff --stat`, and read the actual `git diff` for
  every changed file. Know precisely which files and which functionality are
  being added or changed before the merge happens, not after.
- State that file list back before merging, so a mismatch between "what this
  was supposed to touch" and "what actually changed" is caught before it
  reaches `main`.
- Before any production deployment specifically, additionally verify the
  build (and any relevant tests) succeed against the exact commit being
  deployed, and do one final review of the diff between the last-deployed
  commit and this one — see §Deploying below for the full sequence.

---

## Git workflow

`C:\MaketingWiz\repo` is the git clone — commit and push from here.
`C:\MaketingWiz\project` is the local dev tree used for running and testing; it
is **not** git-initialized. Keep them in sync manually when testing a change.

Push works directly from the clone. (A stale memory note claims 403s requiring
GitHub web upload — that was a machine credential state in Aug 2026 and no
longer applies; pushes succeeded throughout Sep 2026.)

- Branch from `origin/main`, never from a stale local main.
- CRLF makes `git status` report untouched files as modified. Use
  `git diff --stat` for the authoritative changed-file list, and avoid
  `git add -A` when copying trees in from `project/`.
- Before merging to `main`: `git status`, `git diff --stat`, and read the
  full `git diff` — see Hard rule 8. State the changed-file list back before
  merging.
- Merge with `--no-ff` and a message explaining *why*, then push `main` only
  when the user has explicitly said to push.
- Verify the push: `git ls-remote origin refs/heads/main` must equal
  `git rev-parse HEAD`.

## Deploying

Production: Hostinger VPS `srv1399413`, project root `~/altius_tools/Nxt_Sales`,
PM2 process `nxt-sales-api`, port `8009`, PostgreSQL `Nxt_Sales` on
`127.0.0.1:5433`.

Always hand the user commands; never run them. The full annotated sequence —
backup, pull, migrate, restart, rebuild, verify, rollback — is in
`docs/PROJECT_CONTEXT.md §Deployment`. Non-negotiables:

- Before handing over the deploy commands: confirm the build succeeds (and
  any relevant tests pass) against the exact commit being deployed, and do a
  final read of the diff between the currently-deployed commit and this one
  — see Hard rule 8. Deploy commands are for the user to run either way;
  this verification happens before they're given, not instead of it.
- Back up the database **and** `client/dist` **and** record the current commit
  before anything else.
- `npx prisma migrate deploy` — **never** `migrate dev` on production.
- `npx prisma generate` after any schema change, *before* the PM2 restart.
  Omitting it has caused 500s.
- Frontend changes need `npm ci && npm run build` in `client/`. Compare the
  emitted `index-*.js` / `index-*.css` hashes against a local build of the same
  commit — matching hashes prove the deploy landed.
- A `curl` immediately after `pm2 restart` often returns `000` because it races
  the listener. Retry before concluding anything is broken.

## Verification expectations

Claims about production must come from output the user pasted, not inference.
For local work, exercise the real HTTP endpoints against a real database rather
than reasoning about the code.

One recurring trap: `nodemon` watches `*.*` in `server/`, so writing a probe
script or fixture there restarts the API mid-request and produces phantom
failures. Put test artifacts in the scratchpad and run the server with
`node src/index.js`.
