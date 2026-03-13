# intrview.io — QA Memory

## Tech Stack

- **Frontend**: React + Vite (port 5173), `client/src/`
- **Backend**: Express (port 5001), `server/index.js` + `server/routes/`
- **Database**: PostgreSQL via Docker (port 5435), plain SQL via `pg` — no ORM
- **ESM throughout**: both `client/` and `server/` use `"type": "module"`. Exception: `server/routes/advertisers.js` uses CommonJS.

## Test Suite

- **Framework**: vitest (installed, working). Run with `npm test` from `server/`.
- Test files: `server/__tests__/auth.test.js`, `server/__tests__/stripe.test.js`.
- Import pattern: top-level `await import(...)` after `vi.mock(...)` declarations (ESM vitest pattern).
- `beforeEach(() => vi.clearAllMocks())` used globally and per-suite.
- Mock both `pool.query` AND `pool.connect` — transactional code uses `pool.connect()` + client methods.

## Key Areas to Watch for Regressions

### Auth flow
- `server/auth.js`: `requireAuth`, `requireAdmin`, `requireCredits(action)` middleware
- Session token stored in localStorage, sent as `Authorization: Bearer` header
- OTP email flow — any change to `server/auth.js` needs regression check on login

### API utils
- `client/src/utils/api.js`: all client-server calls go through here
- Grouped by domain: `api.practice.*`, `api.progress.*`, `api.chat.*`, `api.gamification.*`
- Changes here affect every feature — high regression risk

### SSE Streaming
- Used for job analysis and FocusChat — streaming responses via Server-Sent Events
- `FocusChat.jsx` and job analysis route in `server/index.js`
- SSE connections must be properly terminated; memory leaks are a common failure mode

### Gamification
- `GamificationContext.jsx` wraps the whole app — state mutations here affect all pages
- `server/routes/gamification.js` — XP, streaks, achievements
- Credit deduction happens in middleware; verify it runs before the action, not after
- `gamStats.streak` is a nested object: `{ current, longest, multiplier, lastPracticeDate }`
- `getLevelForXp()` returns `{ level, title, progressPercent, xpIntoLevel, xpNeededForNext, ... }`

### Component Patterns
- Every component in `client/src/components/` must have a paired `.css` file
- Pages live in `client/src/pages/`, components in `client/src/components/`
- `Practice.jsx` accepts `initialMode` prop — check this when TrainingPage changes

## Common Issues Found

- Missing CSS file when a new component is created
- `requireCredits` middleware placed after the expensive operation instead of before
- SSE response not closing on client disconnect (memory leak)
- Auth token not forwarded in a new API util function
- **Dismissed-state leak in visibility guards**: when a dismiss flag (`nudgeDismissed`) only hides
  a child element but the parent visibility guard still checks the raw state value, the parent
  renders a near-empty section for users with zero streak/XP who dismissed the nudge.
  Always fold the dismiss flag into the parent guard. Fixed in MissionDashboard line 145:
  `hasTrainingData = ... || (weaknessNudge && !nudgeDismissed)`
- **pool.connect not mocked causes regression**: `upgradeSubscription` uses a transaction
  (`pool.connect()` → `client.query(BEGIN/COMMIT/ROLLBACK)` → `client.release()`). The db mock
  must include both `pool.query` and `pool.connect` (returning a mock client with `query`/`release`).
