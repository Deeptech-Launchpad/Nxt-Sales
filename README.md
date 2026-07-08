# NXT Sales — CRM & Marketing Platform

A full-stack CRM and sales/marketing platform (HubSpot-style) with Contacts, Companies, Deals, Email outreach, Gmail integration, meeting scheduling, call logging, team chat, and analytics.

## Tech Stack

- **Frontend:** React 18 + Vite (dev server on **port 3000**)
- **Backend:** Node.js + Express + Prisma ORM (API on **port 4000**)
- **Database:** PostgreSQL
- **Auth:** JWT + Google OAuth
- **Integrations:** Gmail API (send/sync/threads), Google Calendar, CallHippo

## Repository Layout

```
Nxt MarketWiz/
├── client/              # React + Vite frontend
├── server/              # Express + Prisma backend API
├── Email Tool/          # Standalone email outreach tool (optional)
├── EmotionSense_AI_v2/  # Call-recording emotion analysis service (optional)
└── package.json         # Root scripts (runs client + server together)
```

## Prerequisites

- **Node.js** 18+ and npm
- **PostgreSQL** 14+ (this project was developed on PostgreSQL 18)
- A **PostgreSQL database** for the app (default name used below: `nxt_marketwiz`)

## Setup

### 1. Install dependencies (root + client + server)

```bash
npm run install:all
```

### 2. Create the PostgreSQL database

```bash
# using psql (adjust user/password as needed)
createdb -U postgres nxt_marketwiz
```

### 3. Configure environment variables

Create `server/.env` (see `.env.example` for the full list):

```env
DATABASE_URL="postgresql://<user>:<password>@127.0.0.1:5432/nxt_marketwiz"
JWT_SECRET="change-this-to-a-long-random-string"
PORT=4000
CLIENT_URL=http://localhost:3000

# Google OAuth (Gmail send/sync + Calendar) — optional but needed for email/meeting features
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:4000/auth/google/callback"
GOOGLE_EMAIL_CALLBACK_URL="http://localhost:4000/api/email/gmail/callback"

# Optional integrations
CALLHIPPO_API_KEY=""
EMOTIONSENSE_URL="http://localhost:8000"
```

> **Never commit `server/.env`** — it holds secrets and is git-ignored.

### 4. Set up the database schema (Prisma)

```bash
cd server
npx prisma generate      # generate the Prisma client
npx prisma db push       # sync the schema to your database (additive)
cd ..
```

## Running the App

### Run both frontend and backend together (recommended)

```bash
npm run dev
```

- Frontend → http://localhost:3000
- Backend API → http://localhost:4000

### Or run them separately

```bash
npm run dev:client       # frontend only (Vite, port 3000)
npm run dev:server       # backend only (nodemon, port 4000)
```

### Useful backend scripts (run inside `server/`)

```bash
npm run dev              # start API with hot-reload (nodemon)
npm start                # start API (production, node)
npx prisma studio        # open a browser DB viewer (port 5555)
```

## First Login

Register or sign in from **http://localhost:3000**. Connect a Gmail account under the Email module's Settings to enable send/sync and meeting features.

## Notes

- The Vite dev server proxies `/api` and `/auth` requests to the backend at `http://localhost:4000`.
- `node_modules`, build output (`dist`), and all `.env` files are excluded from version control.
