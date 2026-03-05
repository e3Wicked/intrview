# Feature Workflow

You are orchestrating a full feature delivery for **intrview.io** — an AI-powered interview prep app.

## Project Context (load this before delegating)

- **Stack**: React + Vite (client, port 5173) + Express (server, port 5001) + PostgreSQL (Docker, port 5435)
- **Frontend**: `client/src/`, plain CSS co-located with each component, dark theme (#0a0a0a bg, #1a1a1a cards, #f59e0b amber accent), Inconsolata font throughout
- **Backend**: `server/index.js` + `server/routes/`, plain SQL via `pg` (no ORM), ESM throughout
- **Auth**: Passwordless email OTP → session token (cookie + Bearer header). `requireAuth` / `requireAdmin` in `server/auth.js`
- **Credits**: Plans (free/starter/pro/elite) + `CREDIT_COSTS` in `server/auth.js`. Gate actions with `requireCredits(action)` middleware
- **API utils**: All client calls through `client/src/utils/api.js` (Axios, grouped by domain)
- **Key routes**: `/dashboard`, `/job/:jobId`, `/job/:jobId/train`, `/progress`, `/company/:name`
- **State**: React useState + Context (GamificationContext), no Redux/Zustand

## Steps

### Step 1 — Product Requirements

Invoke the `senior-product-manager` agent to write a concise PRD for:

> **$ARGUMENTS**

The PRD should include: problem statement, user stories, acceptance criteria, and any credit/plan gating considerations. Save the output as a markdown plan before proceeding.

### Step 2 — Implementation

Invoke the `staff-fullstack-engineer` agent to implement the feature based on the PRD from Step 1.

Remind the engineer to:
- Follow existing file naming (PascalCase pages in `client/src/pages/`, components in `client/src/components/`)
- Co-locate CSS with every new component
- Add new API routes inline in `server/index.js` unless it warrants a new router file
- Use `requireAuth` and `requireCredits` where appropriate
- Keep state local (useState) unless it truly needs context

### Step 3 — QA

Invoke the `qa-test-guardian` agent to verify the implementation.

The QA agent should:
- Check that the feature matches the PRD acceptance criteria
- Identify any regressions in existing components
- Note that no test suite is currently configured (no vitest/jest) — if tests are warranted, recommend and scaffold them
- Report a clear pass/fail with any issues found
