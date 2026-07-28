# Restoring This Project on a New Machine

Use this after backing up per the checklist you already ran (git push +
`pg_dump` + a securely-copied `server/.env`). This assumes you have, in hand:

- The `server/.env` file, copied securely from the old machine (never via git — it's gitignored on purpose)
- A PostgreSQL dump file, e.g. `nxt_marketwiz_<timestamp>.dump`

---

## 1. Install prerequisites

Match versions to the original machine to avoid subtle issues:

- **Node.js v22.x** (this project runs on v22.23.1) — [nvm-windows](https://github.com/coreybutler/nvm-windows) is easiest if you'll ever need multiple Node versions
- **PostgreSQL 18**
- **Git**

## 2. Clone the repo

```bash
git clone https://github.com/Deeptech-Launchpad/Nxt-Sales.git "Nxt MarketWiz"
cd "Nxt MarketWiz"
```

## 3. Restore `server/.env`

Copy your securely-backed-up `.env` file to `server/.env`. It must define:

```
DATABASE_URL
JWT_SECRET
PORT
CLIENT_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL
GOOGLE_EMAIL_CALLBACK_URL
CALLHIPPO_API_KEY
EMOTIONSENSE_URL
```

If the new machine uses a different Postgres host/port, update `DATABASE_URL` to match.

## 4. Create the database and restore the dump

```powershell
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres -h 127.0.0.1 nxt_marketwiz
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -U postgres -h 127.0.0.1 -d nxt_marketwiz "<path-to>\nxt_marketwiz_<timestamp>.dump"
```

This restores the exact schema **and all data** in one shot. You do **not**
need to re-run Prisma migrations separately — the dump already reflects
every migration applied on the source machine.

## 5. Install dependencies + generate the Prisma client

```bash
cd server
npm install
npx prisma generate

cd ../client
npm install
```

## 6. Sanity-check migration status

```bash
cd server
npx prisma migrate status
```

This project has a known, already-accepted "schema drift" — local migration
history isn't fully tracked even though the dump's actual schema is correct
and current. **Do not** run `prisma migrate dev` or `prisma migrate deploy`
to "fix" this; it's expected, not a problem to resolve.

## 7. Start both servers

```bash
# Terminal 1
cd server
node src/index.js

# Terminal 2
cd client
npm run dev
```

## 8. Verify

- Open `http://localhost:3000`, log in, confirm your companies/deals/chat history are all present
- `curl http://localhost:4000/health` → `{"status":"ok","app":"NXT Sales"}`

## 9. If the port or hostname changed

Google OAuth login will fail with `redirect_uri_mismatch` unless the new
`GOOGLE_CALLBACK_URL` is also added to that OAuth Client's **Authorized
redirect URIs** in [Google Cloud Console](https://console.cloud.google.com/)
→ APIs & Services → Credentials. Same fix as any other redirect-URI mismatch:
add the exact new callback URL to the list, don't replace the existing one.
