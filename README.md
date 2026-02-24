# intrview.io

A web application that generates personalized study plans and interview questions from job description URLs using OpenAI.

## Features

- Paste a job description URL
- Automatically scrapes and extracts job description content
- Uses OpenAI to generate structured study plans and interview questions
- Company research with intelligent caching (PostgreSQL)
- User accounts with Google OAuth and email/password auth
- Stripe-powered subscription plans

## Tech Stack

- **Frontend**: React 18, Vite, React Router
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **AI**: OpenAI API (GPT-4)
- **Payments**: Stripe

---

## Local Setup

### Prerequisites

- Node.js v20+ (v22 LTS recommended — see `.nvmrc`)
- Docker (for the database)

If you use nvm, you can install Node.js v22:

```bash
nvm install 22
nvm use 22
```

### 1. Install dependencies

```bash
make install
```

### 2. Configure environment variables

Create `server/.env` based on the template below:

```env
# Server
PORT=5001
NODE_ENV=development

# Database (matches docker-compose defaults)
DB_HOST=localhost
DB_PORT=5435
DB_NAME=intrview
DB_USER=intrview
DB_PASSWORD=intrview

# OpenAI (required)
OPENAI_API_KEY=sk-...

# Stripe (optional — payments won't work without these)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email / SMTP (optional — email features won't work without these)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASSWORD=your_smtp_password
SMTP_FROM=intrview.io <noreply@intrview.io>
```

### 3. Start the database

```bash
make db-up
```

### 4. Run migrations

```bash
make db-migrate
```

This applies all pending migrations from `server/migrations/` in order, setting up the full schema. Re-running it is safe — already-applied migrations are skipped.

### 5. Start the app

```bash
make dev
```

This runs the Vite dev server (port 5000) and the Express server (port 5001) in parallel. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Available `make` commands

Run `make` with no arguments to see all commands.

| Command | Description |
|---|---|
| `make install` | Install all dependencies (root + server + client) |
| `make dev` | Start client and server in parallel (development) |
| `make dev-client` | Start Vite dev server only |
| `make dev-server` | Start Express server only |
| `make build` | Build the React client for production |
| `make start` | Build client then start server (production mode) |
| `make db-up` | Start Postgres container |
| `make db-migrate` | Apply pending migrations |
| `make db-down` | Stop Postgres container |
| `make db-reset` | Wipe database volume and restart fresh |
| `make db-logs` | Tail Postgres container logs |
| `make db-shell` | Open a `psql` shell inside the container |

---

## Project Structure

```
intrview/
├── client/               # React frontend (Vite)
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── pages/
│   │   └── utils/
│   └── package.json
├── server/               # Express backend
│   ├── index.js          # Main server entry point
│   ├── auth.js           # Authentication logic
│   ├── db.js             # Database client & queries
│   ├── email.js          # Email service
│   ├── stripe.js         # Stripe integration
│   ├── routes/           # Route handlers
│   ├── utils/
│   ├── setup-db.sql      # Database schema
│   └── package.json
├── docker-compose.yml    # Postgres container
├── Makefile
└── package.json
```

---

## Troubleshooting

**Database connection errors**
- Confirm the container is running: `make db-logs`
- Check credentials in `server/.env` match the Docker Compose values
- Reset and reinitialise if needed: `make db-reset`

**OpenAI errors**
- Verify `OPENAI_API_KEY` is set in `server/.env`
- Check you have sufficient API credits

**Port conflicts**
- Client dev server: 5173
- Express server: 5001
- Postgres: 5435 (mapped from container port 5432)
