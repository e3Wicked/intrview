---
name: test-coverage
description: Apply this skill when implementing any new feature, fixing a bug, or modifying existing logic in intrview.io. Ensures tests are written or scaffolded alongside code changes. Use when the user asks to add a feature, fix a bug, or when reviewing code that lacks test coverage.
version: 1.0.0
---

# Test Coverage for intrview.io

No test suite is currently configured. When tests are warranted (new utilities, API routes, business logic), **scaffold the test infrastructure** and write the tests — don't just note they're missing.

## Recommended Stack

| Layer | Tool |
|---|---|
| React components | `vitest` + `@testing-library/react` |
| Express API routes | `vitest` + `supertest` |
| Pure utilities (gamification, achievements) | `vitest` (no DOM needed) |

Install when first adding tests:
```bash
# In client/
npm install -D vitest @testing-library/react @testing-library/user-event jsdom

# In server/
npm install -D vitest supertest
```

Add to `package.json` scripts: `"test": "vitest"` and configure `vitest.config.js`.

## What Deserves Tests

### Always test
- Pure business logic: `calculateXpForAttempt`, `getLevelForXp`, `getStreakMultiplier`, achievement unlock conditions
- API route happy paths and error branches (auth failure → 401, no credits → 402, bad input → 400)
- Credit deduction middleware: confirm credits decrease and route is blocked when at zero

### Test when complexity warrants it
- React components with conditional rendering (e.g., different UI for free vs. paid users)
- Components that manage non-trivial local state (QuizMode, Flashcards, VoicePractice)
- Any new utility added to `client/src/utils/` or `server/utils/`

### Skip for now
- Simple presentational components with no logic
- Database migration files (idempotency is tested by re-running `make db-migrate`)

## Testing Patterns for This Codebase

### Server utility (pure function)
```js
// server/utils/gamification.test.js
import { describe, it, expect } from 'vitest'
import { calculateXpForAttempt, getLevelForXp } from './gamification.js'

describe('calculateXpForAttempt', () => {
  it('awards base XP for quiz with no streak', () => {
    const { xp } = calculateXpForAttempt('quiz', 50, 0)
    expect(xp).toBe(10) // BASE_XP.quiz with 1.0 multiplier, no score bonus
  })

  it('applies streak multiplier', () => {
    const { xp } = calculateXpForAttempt('quiz', 50, 7)
    expect(xp).toBe(15) // 10 * 1.5
  })
})
```

### Express route (supertest)
```js
// server/routes/gamification.test.js
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../index.js'

describe('GET /api/gamification/status', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/gamification/status')
    expect(res.status).toBe(401)
  })

  it('returns status for authenticated user', async () => {
    const res = await request(app)
      .get('/api/gamification/status')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('xp')
    expect(res.body).toHaveProperty('level')
  })
})
```

### React component
```jsx
// client/src/components/XPBar.test.jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import XPBar from './XPBar'

describe('XPBar', () => {
  it('shows correct level and progress', () => {
    render(<XPBar xp={150} />)
    expect(screen.getByText(/Candidate/i)).toBeInTheDocument() // level 2 title
  })
})
```

## Auth Mocking for Server Tests

Create a test helper that generates a valid session token against a test DB, or mock `requireAuth` middleware:

```js
// server/test-helpers/mockAuth.js
export function mockAuth(app, userId = 1) {
  // Replace requireAuth with a middleware that injects a test user
  app.use((req, res, next) => {
    req.user = { id: userId, plan: 'pro', credits: 100 }
    next()
  })
}
```

## Coverage Mindset

After any implementation:
1. List the new logic paths (happy path, each error branch, edge cases).
2. Write one test per path that would catch a regression.
3. Run tests before committing — don't ship untested business logic.
4. If the test is hard to write, that's a signal the code needs refactoring first.
