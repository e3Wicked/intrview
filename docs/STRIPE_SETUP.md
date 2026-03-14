# Stripe Setup Guide

## Overview

Stripe powers subscription billing for intrview.io. The integration uses a **two-bucket credit system**: each plan grants separate allowances for **job analyses** and **training credits**.

**Key files:**
- `server/stripe.js` — checkout sessions, webhook handlers, customer portal
- `server/auth.js` — plan definitions, credit costs, credit-gating middleware
- `server/index.js` — route registration for all `/api/stripe/*` endpoints

## Environment Variables

All variables live in `server/.env`.

| Variable | Required | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | Yes | API secret key (`sk_test_` for dev, `sk_live_` for prod) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret (`whsec_...`) |
| `STRIPE_PRICE_ID_STARTER` | No | Price ID for Starter monthly plan — auto-created if missing |
| `STRIPE_PRICE_ID_PRO` | No | Price ID for Pro monthly plan — auto-created if missing |
| `STRIPE_PRICE_ID_ELITE` | No | Price ID for Elite monthly plan — auto-created if missing |
| `STRIPE_PRICE_ID_STARTER_ANNUAL` | No | Price ID for Starter annual plan — auto-created if missing |
| `STRIPE_PRICE_ID_PRO_ANNUAL` | No | Price ID for Pro annual plan — auto-created if missing |
| `STRIPE_PRICE_ID_ELITE_ANNUAL` | No | Price ID for Elite annual plan — auto-created if missing |
| `STRIPE_PRICE_ID_ADVERTISER` | No | Price ID for Advertiser monthly spot ($999/mo) — auto-created if missing |

> Without `STRIPE_SECRET_KEY`, the server logs `⚠️  STRIPE_SECRET_KEY not set. Stripe features will not work.` and all Stripe endpoints return 500.

## Plans & Pricing

Defined in `server/auth.js` → `PLANS`:

| Plan | Monthly Price | Annual Price | Job Analyses | Training Credits | Lifetime? |
|---|---|---|---|---|---|
| Free | $0 | — | 3 | 15 | Yes (one-time) |
| Starter | $9/mo | $86/yr ($7/mo) | 10/mo | 150/mo | No |
| Pro | $19/mo | $182/yr ($15/mo) | 30/mo | 400/mo | No |
| Elite | $39/mo | $374/yr ($31/mo) | Unlimited | 800/mo | No |

**Free plan** credits are lifetime (non-renewing). Paid plans reset monthly on invoice payment.

Annual billing is monthly price × 12 × 0.80 (20% discount). The `billing_interval` column tracks `'month'` or `'year'`.

## Training Credit Costs

Defined in `server/auth.js` → `TRAINING_CREDIT_COSTS`:

| Action | Cost |
|---|---|
| `chatPractice` | 1 |
| `focusChat` | 1 |
| `quizEvaluation` | 2 |
| `voiceEvaluation` | 2 |
| `companyResearch` | 3 |
| `studyPlan` | 5 |

Job analyses cost 1 job analysis credit each (separate bucket).

## Local Development Setup

### 1. Get Stripe test keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys)
2. Copy the **Secret key** (`sk_test_...`)
3. Add to `server/.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   ```

### 2. Set up webhook forwarding

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and forward webhooks to your local server:

```bash
stripe listen --forward-to localhost:5001/api/stripe/webhook
```

The CLI prints a webhook signing secret (`whsec_...`). Add it to `server/.env`:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

> Keep the `stripe listen` process running while developing.

### 3. Test a checkout

1. Start the app: `make dev`
2. Log in and select a paid plan
3. Use Stripe's test card: `4242 4242 4242 4242` (any future expiry, any CVC)
4. Verify the webhook fires in the `stripe listen` terminal
5. Confirm credits update in the app

## Product & Price Creation

### Option A: Auto-creation (recommended for dev)

Leave `STRIPE_PRICE_ID_*` unset. On the first checkout for each plan, the server automatically creates a Stripe Product and Price, then logs:

```
Creating Stripe product and price for starter...
✅ Created Stripe price for starter: price_1ABC...
💡 Add this to your .env: STRIPE_PRICE_ID_STARTER=price_1ABC...
```

Copy the logged price IDs to `.env` to avoid re-creating them.

### Option B: Manual creation

1. In [Stripe Dashboard → Products](https://dashboard.stripe.com/test/products), create three products:
   - **Starter Plan** — $9/mo recurring
   - **Pro Plan** — $19/mo recurring
   - **Elite Plan** — $39/mo recurring
2. Copy each Price ID and add to `server/.env`:
   ```
   STRIPE_PRICE_ID_STARTER=price_...
   STRIPE_PRICE_ID_PRO=price_...
   STRIPE_PRICE_ID_ELITE=price_...
   ```

## Customer Portal Configuration

The customer portal lets users manage their subscription (cancel, switch plans, update payment).

0. Create a Product per Tier (Starter, Pro, Elite)
1. Go to [Stripe Dashboard → Settings → Billing → Customer portal](https://dashboard.stripe.com/test/settings/billing/portal)
2. Enable:
   - **Cancel subscriptions** — allow at period end
   - **Switch plans** — allow upgrading/downgrading between your products
   - **Update payment methods**
3. Save

## Production Setup

### 1. Switch to live keys

Replace test keys in `server/.env`:

```
STRIPE_SECRET_KEY=sk_live_...
```

### 2. Create webhook endpoint

In [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks):

1. Click **Add endpoint**
2. URL: `https://yourdomain.com/api/stripe/webhook`
3. Select these events:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. Copy the **Signing secret** to `server/.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### 3. Create live products/prices

Either set `STRIPE_PRICE_ID_*` env vars with live price IDs, or let auto-creation handle it on first checkout (same as dev).

## Smart Retries

Enable **Smart Retries** in Stripe Dashboard → Settings → Subscriptions and emails → Manage failed payments → Smart Retries. This uses ML to retry failed payments at optimal times. No code change required.

## Receipt Emails

Enable in Stripe Dashboard → Settings → Emails → Customer emails:
- **Successful payments** — sends a receipt after each charge
- **Refunds** (optional) — sends confirmation on refunds

No code change required. Stripe handles email delivery and formatting.

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/stripe/create-checkout` | `requireAuth` | Creates a Stripe Checkout session for a plan |
| POST | `/api/stripe/webhook` | None (signature verified) | Receives Stripe webhook events |
| POST | `/api/stripe/create-portal` | `requireAuth` | Creates a customer portal session |
| POST | `/api/stripe/upgrade-subscription` | `requireAuth` | Upgrades an existing paid subscription |
| GET | `/api/stripe/verify-checkout` | `requireAuth` | Verifies checkout completion (post-redirect) |
| POST | `/api/stripe/create-advertiser-checkout` | None | Creates a $999/mo advertiser checkout session |

## DB Schema

The `subscriptions` table (from migrations `001` + `009`):

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | INTEGER (FK → users) | Unique per user |
| `stripe_customer_id` | VARCHAR(255) | Stripe Customer ID |
| `stripe_subscription_id` | VARCHAR(255) | Stripe Subscription ID |
| `plan` | VARCHAR(50) | `free`, `starter`, `pro`, `elite` |
| `status` | VARCHAR(50) | `active`, `past_due`, `canceled` |
| `current_period_start` | TIMESTAMP | Billing period start |
| `current_period_end` | TIMESTAMP | Billing period end |
| `credits_remaining` | INTEGER | Legacy single-bucket (kept for compat) |
| `credits_monthly_allowance` | INTEGER | Legacy single-bucket (kept for compat) |
| `credits_reset_at` | TIMESTAMP | Next credit reset |
| `job_analyses_remaining` | INTEGER | Current job analysis balance |
| `job_analyses_monthly_allowance` | INTEGER | Monthly job analysis quota (-1 = unlimited) |
| `training_credits_remaining` | INTEGER | Current training credit balance |
| `training_credits_monthly_allowance` | INTEGER | Monthly training credit quota |
| `is_lifetime_plan` | BOOLEAN | True for free plan (no monthly reset) |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

### `advertiser_subscriptions` table (from migration `015`):

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PK | |
| `advertiser_id` | INTEGER (FK -> advertisers) | Links to advertiser record |
| `stripe_customer_id` | VARCHAR(255) | Stripe Customer ID |
| `stripe_subscription_id` | VARCHAR(255) UNIQUE | Stripe Subscription ID |
| `contact_email` | VARCHAR(255) | Billing contact email |
| `status` | VARCHAR(50) | `active`, `past_due`, `canceled` |
| `current_period_start` | TIMESTAMP | Billing period start |
| `current_period_end` | TIMESTAMP | Billing period end |
| `payment_failed_at` | TIMESTAMP | First payment failure timestamp |
| `grace_period_end` | TIMESTAMP | End of grace period after payment failure |
| `dunning_emails_sent` | INTEGER | Count of dunning emails sent |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

## Verification Checklist

### Development

- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` set in `server/.env`
- [ ] `stripe listen` forwarding to `localhost:5001/api/stripe/webhook`
- [ ] Checkout with test card `4242 4242 4242 4242` completes
- [ ] `checkout.session.completed` webhook fires and updates `subscriptions` table
- [ ] User's plan, job analyses, and training credits update correctly
- [ ] Customer portal opens and allows cancellation
- [ ] After cancellation, user reverts to free plan with lifetime credits

### Production

- [ ] Live `STRIPE_SECRET_KEY` (`sk_live_`) in production env
- [ ] Webhook endpoint created at `https://yourdomain.com/api/stripe/webhook`
- [ ] All 5 webhook events selected
- [ ] `STRIPE_WEBHOOK_SECRET` set to the live endpoint's signing secret
- [ ] Test a real transaction end-to-end
- [ ] Verify credit resets on subscription renewal (`invoice.payment_succeeded`)

## Troubleshooting

**"Stripe not configured" errors**
Server started without `STRIPE_SECRET_KEY`. Check `server/.env` and restart.

**Webhook signature verification failed**
`STRIPE_WEBHOOK_SECRET` doesn't match. For local dev, use the secret from `stripe listen`. For production, use the secret from the Dashboard webhook endpoint. Note: the webhook route must receive the raw body (`express.raw()`), which is already configured.

**Products/prices created multiple times**
Without `STRIPE_PRICE_ID_*` env vars, auto-creation runs on every first checkout. Copy the logged price IDs to `.env` to pin them.

**Credits not updating after payment**
Check that the webhook is reaching your server. In dev, confirm `stripe listen` is running. In production, check the webhook logs in Stripe Dashboard for delivery failures.

**Subscription shows wrong plan after upgrade**
The `checkout.session.completed` handler reads `metadata.plan` from the session. Verify the plan key is correctly passed in the checkout request body.
