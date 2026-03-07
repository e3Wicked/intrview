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

The PRD should include: problem statement, user stories, acceptance criteria, and any credit/plan gating considerations. Save the output as a markdown plan in `docs/` before proceeding.

### Step 2 — UX Design (parallel with Step 3)

Invoke the `ux-design-translator` agent with the PRD from Step 1.

The UX designer should:
- Read the PRD and translate it into concrete UI/UX requirements
- Define the user flow (entry point, happy path, error/empty states, exit)
- Specify component layout, visual hierarchy, interaction patterns, and micro-copy
- Provide detailed UI specs: which components to create or modify, what they render in each state, exact button labels, messaging tone
- Save the UI requirements as a markdown file in `docs/` (e.g., `docs/ux-<feature-name>.md`)

### Step 3 — Implementation (after Steps 1 and 2)

Invoke the `staff-fullstack-engineer` agent to implement the feature based on **both** the PRD from Step 1 and the UI requirements from Step 2.

Remind the engineer to:
- Read and follow the UX designer's UI specs — component structure, copy, states, and interaction patterns
- Follow existing file naming (PascalCase pages in `client/src/pages/`, components in `client/src/components/`)
- Co-locate CSS with every new component
- Add new API routes inline in `server/index.js` unless it warrants a new router file
- Use `requireAuth` and `requireCredits` where appropriate
- Keep state local (useState) unless it truly needs context

### Step 4 — QA & Tests

Invoke the `qa-test-guardian` agent to verify the implementation and write tests.

The QA agent should:
- Check that the feature matches **both** the PRD acceptance criteria and the UX designer's UI specs
- Identify any regressions in existing components
- **Write unit tests** for all new or modified logic (use Vitest — config at `client/vitest.config.js`, test files in `client/src/components/__tests__/`)
- Test key scenarios: happy path, edge cases (empty states, error states), and any credit/auth gating
- Run the tests to confirm they pass
- Report a clear **PASS / FAIL / NEEDS ATTENTION** verdict with specific file:line callouts for any issues
