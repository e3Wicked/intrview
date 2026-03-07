# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All day-to-day commands go through `make`. Run `make` with no args to see the full list.

| Command | What it does |
|---|---|
| `make dev` | Start Express + Vite in parallel (primary dev command) |
| `make dev-client` | Vite only (port 5173) |
| `make dev-server` | Express only (port 5001) |
| `make build` | Vite build → `client/dist/` |
| `make install` | `npm install` in root + server + client |
| `make db-up` | Start Postgres Docker container |
| `make db-migrate` | Run pending migrations |
| `make db-reset` | Wipe volume and restart fresh |
| `make db-shell` | `psql` shell in container |

**Ports:** Client: `5173`, Server: `5001`, Postgres (mapped): `5435`

No test suite is configured.

## Architecture

Full-stack: React (Vite) frontend + Express backend + PostgreSQL via Docker.

**Client-server communication:** Vite proxies `/api/*` to `http://localhost:5001` in dev. In production, Express serves `client/dist/` as static files and handles all `/api/*` directly. All client API calls go through `client/src/utils/api.js` (Axios-based, grouped by domain: `api.practice.*`, `api.progress.*`, etc.).

**Database:** Plain SQL via `pg` — no ORM. All query functions exported from `server/db.js`. Migrations are numbered SQL files in `server/migrations/`, applied in order by `server/migrate.js`. Re-running `db-migrate` is idempotent.

**Environment:** All env vars live in `server/.env`. The server loads it via `node --import ./env.js index.js` — there is no top-of-file `dotenv.config()`. Required vars: `OPENAI_API_KEY`, `DB_*`. Optional: `STRIPE_*` (payments), `SMTP_*` (email OTP auth).

## Key Patterns

**Auth:** Passwordless email OTP — user requests a 6-digit code, verifies it, gets a session token back as both a cookie and response body. Subsequent requests pass the token via `Authorization: Bearer` header. `requireAuth` and `requireAdmin` middleware live in `server/auth.js`. Admin emails are hardcoded in `auth.js`.

**Credits & plans:** Plans (`free`, `starter`, `pro`, `elite`) and per-action credit costs (`CREDIT_COSTS`) are defined in `server/auth.js`. Use `requireCredits(action)` middleware to gate and deduct credits. Stripe handles checkout/webhooks/portal via `server/stripe.js`.

**Route registration:** Most routes are defined inline in `server/index.js`. Only `practice.js` and `advertisers.js` use Express Router and are imported as sub-routers.

**Caching:** Study plans and company research are cached in the DB by hashing the job description or by company+role lookup, avoiding redundant OpenAI calls.

**ESM throughout:** Both `server/` and `client/` use `"type": "module"`. Exception: `server/routes/advertisers.js` uses CommonJS `require()`.

**Components:** Every component in `client/src/components/` has a paired `.css` file with the same name.

**Client routing:** All routes defined in `client/src/App.jsx`. Key routes: `/` (homepage/landing), `/dashboard`, `/job/:jobId` (job analysis view), `/company/:companyName`, `/progress`, `/focus-chat`, `/study/drills`, `/study/mock-interview`, `/admin` (admin-only). App.jsx owns global state (`user`, `result`, `jdHistory`) and passes it down. Job analysis results are temporarily cached in `sessionStorage` keyed by job ID, with the DB as the primary source of truth.

**Dev email:** Without SMTP configured, OTP codes are printed to the server console instead of being emailed. Check server logs to get the code during local development.
