---
name: project_testing_patterns
description: Testing framework, conventions, and mock patterns for the intrview server test suite
type: project
---

## Framework
- Vitest (`vitest run`), ESM throughout
- Test files live in `server/__tests__/`
- Run via `cd server && npm test`

## Mock Architecture

### Stripe SDK
Mocked via `vi.mock('stripe', () => ({ default: vi.fn(() => mockStripe) }))`.
`mockStripe` is a manually constructed object at file top — all methods are `vi.fn()`.
Key methods: `subscriptions.retrieve`, `subscriptions.update`, `subscriptions.cancel`, `subscriptions.list`, `checkout.sessions.create/list`, `webhooks.constructEvent`, `billingPortal.sessions.create`, `customers.create`, `products.create`, `prices.create`.

### DB Pool
Mocked via `vi.mock('../db.js', ...)`. Two distinct mock objects:
- `pool.query` — for non-transactional queries (direct pool usage)
- `pool.connect` — returns `mockClient`; `mockClient = { query: vi.fn(), release: vi.fn() }`

### Email
Mocked via `vi.mock('../email.js', ...)`. Use named module-level `vi.fn()` variables for functions
you need to assert on (e.g., `mockSendCancellationConfirmationEmail`). Wire them via wrapper:
`sendCancellationConfirmationEmail: (...args) => mockFn(...args)`.

## Transaction Mock Sequence
Functions using `pool.connect()` / BEGIN-COMMIT follow this exact `mockClient.query` call order:
1. `BEGIN` → `{ rows: [] }`
2. `SELECT ... FOR UPDATE` → actual data row
3. Any intermediate UPDATEs / INSERTs → `{ rows: [] }`
4. `COMMIT` → `{ rows: [] }`

Rollback sequence (error path):
1. `BEGIN` → `{ rows: [] }`
2. `SELECT` → data (or empty to trigger the throw)
3. `ROLLBACK` → `{ rows: [] }`

After COMMIT, `pool.query` (not `mockClient.query`) is used for out-of-transaction operations
(e.g., email address lookup in `scheduleCancellation`).

## beforeEach Reset
`vi.clearAllMocks()` is called, then:
```js
pool.connect.mockResolvedValue(mockClient);
mockClient.query.mockResolvedValue({ rows: [] });
```
Tests override with `mockResolvedValueOnce` in the exact call order.

## Finding Specific DB Calls in Assertions
Pattern used throughout:
```js
const call = mockClient.query.mock.calls.find(
  (c) => typeof c[0] === 'string' && c[0].includes('some SQL fragment')
);
expect(call).toBeDefined();
expect(call[1][N]).toBe(expectedValue); // check Nth bound parameter
```

## Webhook Test Pattern
`handleWebhook` always consumes one `pool.query` call for idempotency INSERT first,
then proceeds to event-specific queries. Always mock the idempotency INSERT first:
```js
pool.query.mockResolvedValueOnce({ rows: [] }); // idempotency INSERT
```

## cancel_at_period_end Sync Queries (handleSubscriptionUpdated)
- `cancel_at_period_end: true` → UPDATE WHERE `cancel_at_period_end = false` (idempotent)
- `cancel_at_period_end: false` → UPDATE clearing reason/comment/cancelled_at WHERE `cancel_at_period_end = true`
Both use `pool.query`, not a transaction client.
