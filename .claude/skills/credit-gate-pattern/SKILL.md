---
name: credit-gate-pattern
description: Apply this skill when adding any feature or API route that should be restricted by plan or cost credits in intrview.io. Use when the user says a feature should be "for paid users", "cost credits", "gated", or when adding a new action type. Ensures the full credit-gating flow is implemented correctly on both server and client.
version: 1.0.0
---

# Credit Gating Pattern for intrview.io

intrview.io gates actions behind a credit system. Getting this wrong means either giving away paid features for free or blocking users incorrectly. Follow this pattern completely.

## Concepts

- **Plans**: `free`, `starter`, `pro`, `elite` — defined in `server/auth.js`
- **CREDIT_COSTS**: a map of `action → credit cost` — defined in `server/auth.js`
- **requireCredits(action)**: Express middleware that checks credits, deducts them if sufficient, returns 402 if not

## Full Implementation Checklist

### Step 1 — Register the action cost in `server/auth.js`

```js
// Add to CREDIT_COSTS object
export const CREDIT_COSTS = {
  // existing actions...
  your_new_action: 5,  // cost in credits
}
```

### Step 2 — Gate the route in `server/index.js`

Always stack middleware in this order: `requireAuth` → `requireCredits(action)` → handler.

```js
app.post('/api/your-endpoint', requireAuth, requireCredits('your_new_action'), async (req, res) => {
  // credits already deducted by middleware — do the work
  try {
    const result = await doExpensiveOperation(req.body)
    res.json(result)
  } catch (err) {
    // If operation fails after credit deduction, refund credits
    await refundCredits(req.user.id, CREDIT_COSTS.your_new_action)
    res.status(500).json({ error: 'Operation failed' })
  }
})
```

> **Important**: If the operation can fail after credits are deducted, refund them. Don't silently charge for failed actions.

### Step 3 — Handle 402 on the client

All API calls go through `client/src/utils/api.js`. When a call returns 402, the client must show the `UpgradeModal`. The pattern is already established in `App.jsx`:

```js
// In any component or page making a gated API call
try {
  const result = await api.yourDomain.yourAction(params)
  // handle success
} catch (err) {
  if (err.response?.status === 401) {
    setShowLoginModal(true)
  } else if (err.response?.status === 402) {
    setShowUpgradeModal(true)  // passed down from App.jsx, or use context
  } else {
    setError(err.response?.data?.error || 'Something went wrong')
  }
}
```

If `setShowUpgradeModal` isn't available in the component's scope, propagate the `onUpgradeRequired` callback as a prop from the parent page, or trigger via a context event.

### Step 4 — Disable the UI trigger proactively (optional but good UX)

If you know the user can't afford an action, disable the button before they try it:

```jsx
const canAfford = user?.credits >= CREDIT_COSTS.your_new_action
// CREDIT_COSTS must be mirrored client-side or fetched from /api/auth/me

<button
  onClick={handleAction}
  disabled={!canAfford}
  title={!canAfford ? 'Not enough credits — upgrade your plan' : undefined}
>
  Run Analysis
</button>
```

## Plan-Only Gating (no credit cost)

To restrict a feature to a specific plan without a credit cost:

```js
// server — inline plan check
app.get('/api/premium-feature', requireAuth, (req, res, next) => {
  const allowedPlans = ['starter', 'pro', 'elite']
  if (!allowedPlans.includes(req.user.plan)) {
    return res.status(403).json({ error: 'This feature requires a paid plan' })
  }
  next()
}, async (req, res) => {
  // handler
})
```

Handle `403` on the client the same as `402` — show the UpgradeModal.

## Common Mistakes

| Mistake | Consequence |
|---|---|
| Forgetting `requireAuth` before `requireCredits` | Credits checked against undefined user → server crash |
| Not refunding credits on failed operations | Users pay for errors |
| Only gating the server, not reflecting in UI | Bad UX — user clicks and gets an error instead of a prompt |
| Adding action to CREDIT_COSTS but not the route middleware | Feature is free despite being "gated" |
| Hard-coding plan checks instead of using middleware | Inconsistent enforcement, harder to maintain |
