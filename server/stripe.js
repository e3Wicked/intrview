import Stripe from 'stripe';
import { pool } from './db.js';
import { createAdvertiserSubscription, getAdvertiserSubByStripeId, updateAdvertiserSubStatus, deactivateAdvertiserBySubId } from './db.js';
import { PLANS } from './auth.js';
import { sendPaymentFailedEmail, sendPaymentReminderEmail, sendPaymentFinalWarningEmail } from './email.js';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️  STRIPE_SECRET_KEY not set. Stripe features will not work.');
}

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

function buildPriceIdToPlanMap() {
  const map = {};
  for (const planKey of ['starter', 'pro', 'elite']) {
    const monthlyId = process.env[`STRIPE_PRICE_ID_${planKey.toUpperCase()}`];
    const annualId = process.env[`STRIPE_PRICE_ID_${planKey.toUpperCase()}_ANNUAL`];
    if (monthlyId) map[monthlyId] = { plan: planKey, interval: 'month' };
    if (annualId) map[annualId] = { plan: planKey, interval: 'year' };
  }
  return map;
}
const PRICE_ID_TO_PLAN = buildPriceIdToPlanMap();

async function getSubscriptionOwner(stripeSubscriptionId) {
  const userResult = await pool.query(
    'SELECT user_id, plan FROM subscriptions WHERE stripe_subscription_id = $1',
    [stripeSubscriptionId]
  );
  if (userResult.rows.length > 0) {
    return { type: 'user', ...userResult.rows[0] };
  }
  const advSub = await getAdvertiserSubByStripeId(stripeSubscriptionId);
  if (advSub) {
    return { type: 'advertiser', ...advSub };
  }
  return null;
}

export async function activateSubscription(userId, planKey, stripeSubscriptionId, periodStart, periodEnd, billingInterval = 'month', dbClient = null) {
  const db = dbClient || pool;
  const planDef = PLANS[planKey];
  if (!planDef) throw new Error(`Unknown plan: ${planKey}`);
  const jobAnalyses = planDef.monthlyJobAnalyses === -1 ? 999999 : planDef.monthlyJobAnalyses;
  const trainingCredits = planDef.monthlyTrainingCredits;
  await db.query(
    `UPDATE subscriptions SET plan=$1, stripe_subscription_id=$2, status='active',
     current_period_start=to_timestamp($3), current_period_end=to_timestamp($4),
     credits_remaining=$5, credits_monthly_allowance=$5, credits_reset_at=to_timestamp($4),
     job_analyses_remaining=$6, job_analyses_monthly_allowance=$7,
     training_credits_remaining=$8, training_credits_monthly_allowance=$8,
     billing_interval=$9,
     is_lifetime_plan=false, updated_at=CURRENT_TIMESTAMP WHERE user_id=$10`,
    [planKey, stripeSubscriptionId, periodStart, periodEnd,
     trainingCredits, jobAnalyses, planDef.monthlyJobAnalyses, trainingCredits, billingInterval, userId]
  );
}

// Create Stripe products and prices (run once to set up)
export async function createStripeProducts() {
  const products = [];

  for (const [planKey, plan] of Object.entries(PLANS)) {
    if (plan.price) {
      const product = await stripe.products.create({
        name: `${plan.name} Plan`,
        description: `intrview.io ${plan.name} subscription`
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price * 100, // Convert to cents
        currency: 'usd',
        recurring: {
          interval: 'month'
        }
      });

      products.push({
        plan: planKey,
        productId: product.id,
        priceId: price.id
      });
    }
  }

  return products;
}

// Resolve the Stripe price ID for a plan (from env or auto-create)
export async function getPriceIdForPlan(planKey, interval = 'month') {
  const plan = PLANS[planKey];
  if (!plan || !plan.price) {
    throw new Error('Invalid plan');
  }

  const envSuffix = interval === 'year' ? `_ANNUAL` : '';
  let priceId = process.env[`STRIPE_PRICE_ID_${planKey.toUpperCase()}${envSuffix}`];

  if (!priceId) {
    const label = interval === 'year' ? 'annual' : 'monthly';
    console.log(`Creating Stripe product and ${label} price for ${planKey}...`);
    try {
      const product = await stripe.products.create({
        name: `${plan.name} Plan`,
        description: `intrview.io ${plan.name} subscription`
      });

      const unitAmount = interval === 'year'
        ? Math.round(plan.price * 12 * 0.8 * 100)
        : plan.price * 100;

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: unitAmount,
        currency: 'usd',
        recurring: { interval }
      });

      priceId = price.id;
      const envKey = `STRIPE_PRICE_ID_${planKey.toUpperCase()}${envSuffix}`;
      console.log(`Created Stripe ${label} price for ${planKey}: ${priceId}`);
      console.log(`Add this to your .env: ${envKey}=${priceId}`);
    } catch (error) {
      console.error('Error creating Stripe product/price:', error);
      throw new Error(`Failed to create Stripe price: ${error.message}`);
    }
  }

  return priceId;
}

// Create checkout session (for free → paid transitions)
export async function createCheckoutSession(userId, planKey, successUrl, cancelUrl, interval = 'month') {
  const plan = PLANS[planKey];
  if (!plan || !plan.price) {
    throw new Error('Invalid plan');
  }

  // Get or create Stripe customer
  const userResult = await pool.query(
    'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1',
    [userId]
  );

  let customerId = userResult.rows[0]?.stripe_customer_id;

  if (!customerId) {
    const userResult = await pool.query('SELECT email, name FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: {
        userId: userId.toString()
      }
    });

    customerId = customer.id;

    await pool.query(
      'UPDATE subscriptions SET stripe_customer_id = $1 WHERE user_id = $2',
      [customerId, userId]
    );
  }

  const priceId = await getPriceIdForPlan(planKey, interval);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: userId.toString(),
      plan: planKey,
      interval
    }
  });

  return session;
}

// Upgrade an existing subscription to a new plan (paid → paid)
export async function upgradeSubscription(userId, newPlanKey, interval = 'month') {
  const planDef = PLANS[newPlanKey];
  if (!planDef || !planDef.price) throw new Error('Invalid plan');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subResult = await client.query(
      'SELECT stripe_subscription_id, plan FROM subscriptions WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const row = subResult.rows[0];
    if (!row?.stripe_subscription_id) throw new Error('No active subscription to upgrade');

    const planOrder = ['free', 'starter', 'pro', 'elite'];
    if (planOrder.indexOf(newPlanKey) <= planOrder.indexOf(row.plan)) {
      throw new Error('Cannot downgrade via upgrade endpoint. Use billing portal.');
    }

    const currentSub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    const itemId = currentSub.items.data[0].id;
    const newPriceId = await getPriceIdForPlan(newPlanKey, interval);
    const updatedSub = await stripe.subscriptions.update(row.stripe_subscription_id, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'always_invoice'
    });

    await activateSubscription(userId, newPlanKey, row.stripe_subscription_id,
      updatedSub.current_period_start, updatedSub.current_period_end, interval, client);

    await client.query('COMMIT');
    return updatedSub;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Schedule a downgrade for end of billing period
export async function scheduleDowngrade(userId, newPlanKey, interval = 'month') {
  const planDef = PLANS[newPlanKey];
  if (!planDef || !planDef.price) throw new Error('Invalid plan');
  if (newPlanKey === 'free') throw new Error('Use cancellation to downgrade to free');

  const planOrder = ['free', 'starter', 'pro', 'elite'];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subResult = await client.query(
      'SELECT stripe_subscription_id, plan FROM subscriptions WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const row = subResult.rows[0];
    if (!row?.stripe_subscription_id) throw new Error('No active subscription');

    if (planOrder.indexOf(newPlanKey) >= planOrder.indexOf(row.plan)) {
      throw new Error('New plan must be a lower tier than current plan');
    }

    const currentSub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    const itemId = currentSub.items.data[0].id;
    const newPriceId = await getPriceIdForPlan(newPlanKey, interval);

    await stripe.subscriptions.update(row.stripe_subscription_id, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'none'
    });

    await client.query(
      `UPDATE subscriptions
       SET scheduled_downgrade_plan = $1, scheduled_downgrade_at = NOW(), updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [newPlanKey, userId]
    );

    await client.query('COMMIT');
    return {
      scheduledPlan: newPlanKey,
      effectiveDate: new Date(currentSub.current_period_end * 1000)
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Cancel a scheduled downgrade — revert Stripe to current plan price
export async function cancelScheduledDowngrade(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subResult = await client.query(
      'SELECT stripe_subscription_id, plan, scheduled_downgrade_plan, billing_interval FROM subscriptions WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const row = subResult.rows[0];
    if (!row?.scheduled_downgrade_plan) throw new Error('No scheduled downgrade to cancel');

    const currentSub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    const itemId = currentSub.items.data[0].id;
    const currentPriceId = await getPriceIdForPlan(row.plan, row.billing_interval || 'month');

    await stripe.subscriptions.update(row.stripe_subscription_id, {
      items: [{ id: itemId, price: currentPriceId }],
      proration_behavior: 'none'
    });

    await client.query(
      `UPDATE subscriptions
       SET scheduled_downgrade_plan = NULL, scheduled_downgrade_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Handle webhook events
export async function handleWebhook(event) {
  // Idempotency guard: skip already-processed events
  try {
    await pool.query(
      'INSERT INTO webhook_events (event_id, event_type) VALUES ($1, $2)',
      [event.id, event.type]
    );
  } catch (err) {
    if (err.code === '23505') {
      console.log(`Webhook event ${event.id} already processed, skipping`);
      return;
    }
    throw err;
  }

  await processWebhookEvent(event);
}

async function processWebhookEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
  }
}

async function handleCheckoutCompleted(session) {
  // Branch on advertiser vs user checkout
  if (session.metadata.type === 'advertiser') {
    await handleAdvertiserCheckoutCompleted(session);
    return;
  }
  const userId = parseInt(session.metadata.userId);
  const plan = session.metadata.plan;
  const interval = session.metadata.interval || 'month';
  const subscriptionId = session.subscription;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await activateSubscription(userId, plan, subscriptionId,
    subscription.current_period_start, subscription.current_period_end, interval);
}

async function handleAdvertiserCheckoutCompleted(session) {
  const advertiserId = parseInt(session.metadata.advertiserId);
  const email = session.customer_details?.email || session.customer_email;
  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  await createAdvertiserSubscription(
    advertiserId, email, customerId, subscriptionId,
    subscription.current_period_start, subscription.current_period_end
  );

  // Activate the advertiser
  await pool.query(
    'UPDATE advertisers SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [advertiserId]
  );
  console.log(`Advertiser subscription created for advertiser ${advertiserId}`);
}

async function handlePaymentSucceeded(invoice) {
  const subscriptionId = invoice.subscription;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const result = await pool.query(
    'SELECT user_id, plan FROM subscriptions WHERE stripe_subscription_id = $1',
    [subscriptionId]
  );

  if (result.rows.length > 0) {
    const { user_id, plan } = result.rows[0];

    const planDef = PLANS[plan];
    const jobAnalyses = planDef.monthlyJobAnalyses === -1 ? 999999 : planDef.monthlyJobAnalyses;
    const trainingCredits = planDef.monthlyTrainingCredits;

    // Reset both buckets to monthly allowance (only for non-lifetime plans)
    await pool.query(
      `UPDATE subscriptions
       SET credits_remaining = $1,
           credits_monthly_allowance = $1,
           credits_reset_at = to_timestamp($2),
           current_period_start = to_timestamp($3),
           current_period_end = to_timestamp($4),
           job_analyses_remaining = $5,
           training_credits_remaining = $6,
           status = 'active',
           payment_failed_at = NULL,
           grace_period_end = NULL,
           dunning_emails_sent = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $7 AND is_lifetime_plan = false`,
      [
        trainingCredits,
        subscription.current_period_end,
        subscription.current_period_start,
        subscription.current_period_end,
        jobAnalyses,
        trainingCredits,
        user_id
      ]
    );

    // Apply scheduled downgrade if one exists
    const downgradeResult = await pool.query(
      'SELECT scheduled_downgrade_plan FROM subscriptions WHERE user_id = $1',
      [user_id]
    );
    const scheduledPlan = downgradeResult.rows[0]?.scheduled_downgrade_plan;
    if (scheduledPlan && PLANS[scheduledPlan]) {
      const newPlanDef = PLANS[scheduledPlan];
      const newJobAnalyses = newPlanDef.monthlyJobAnalyses === -1 ? 999999 : newPlanDef.monthlyJobAnalyses;
      const newTrainingCredits = newPlanDef.monthlyTrainingCredits;

      await pool.query(
        `UPDATE subscriptions
         SET plan = $1,
             credits_remaining = $2,
             credits_monthly_allowance = $2,
             job_analyses_remaining = $3,
             job_analyses_monthly_allowance = $4,
             training_credits_remaining = $2,
             training_credits_monthly_allowance = $2,
             scheduled_downgrade_plan = NULL,
             scheduled_downgrade_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $5`,
        [scheduledPlan, newTrainingCredits, newJobAnalyses, newPlanDef.monthlyJobAnalyses, user_id]
      );
    }
  }
  // Check advertiser subscriptions
  else {
    const advSub = await getAdvertiserSubByStripeId(subscriptionId);
    if (advSub) {
      await updateAdvertiserSubStatus(subscriptionId, {
        status: 'active',
        current_period_start: new Date(subscription.current_period_start * 1000),
        current_period_end: new Date(subscription.current_period_end * 1000),
        payment_failed_at: null,
        grace_period_end: null,
        dunning_emails_sent: 0
      });
    }
  }
}

// NOTE: Enable Stripe Smart Retries in Dashboard for automatic payment retry scheduling.
async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  const appUrl = process.env.APP_URL || 'https://intrview.io';

  // Get current dunning state + user email
  const result = await pool.query(
    `SELECT s.user_id, s.plan, s.payment_failed_at, s.dunning_emails_sent, u.email
     FROM subscriptions s
     JOIN users u ON s.user_id = u.id
     WHERE s.stripe_subscription_id = $1`,
    [subscriptionId]
  );

  if (result.rows.length === 0) {
    // Check advertiser subscriptions
    const advSub = await getAdvertiserSubByStripeId(subscriptionId);
    if (advSub) {
      if (!advSub.payment_failed_at) {
        await updateAdvertiserSubStatus(subscriptionId, {
          status: 'past_due',
          payment_failed_at: new Date(),
          grace_period_end: new Date(Date.now() + 7 * 86400000),
          dunning_emails_sent: 1
        });
      } else {
        await updateAdvertiserSubStatus(subscriptionId, {
          status: 'past_due',
          dunning_emails_sent: (advSub.dunning_emails_sent || 0) + 1
        });
      }
    }
    return;
  }

  const { user_id, plan, payment_failed_at, dunning_emails_sent, email } = result.rows[0];
  const planDef = PLANS[plan];
  const emailsSent = dunning_emails_sent || 0;

  // Set grace period on first failure, always increment counter and set past_due
  if (!payment_failed_at) {
    await pool.query(
      `UPDATE subscriptions
       SET status = 'past_due',
           payment_failed_at = CURRENT_TIMESTAMP,
           grace_period_end = CURRENT_TIMESTAMP + INTERVAL '7 days',
           dunning_emails_sent = 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE stripe_subscription_id = $1`,
      [subscriptionId]
    );
  } else {
    await pool.query(
      `UPDATE subscriptions
       SET status = 'past_due',
           dunning_emails_sent = dunning_emails_sent + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE stripe_subscription_id = $1`,
      [subscriptionId]
    );
  }

  // Send appropriate dunning email (best-effort)
  if (emailsSent === 0) {
    await sendPaymentFailedEmail(email, planDef?.name || plan, appUrl);
  } else if (emailsSent === 1) {
    const daysRemaining = payment_failed_at
      ? Math.max(0, Math.ceil((new Date(payment_failed_at).getTime() + 7 * 86400000 - Date.now()) / 86400000))
      : 4;
    await sendPaymentReminderEmail(email, planDef?.name || plan, daysRemaining, appUrl);
  } else if (emailsSent === 2) {
    await sendPaymentFinalWarningEmail(email, planDef?.name || plan, appUrl);
  }
  // emailsSent >= 3: stop sending
}

async function handleSubscriptionDeleted(subscription) {
  const freePlan = PLANS.free;
  await pool.query(
    `UPDATE subscriptions
     SET plan = 'free',
         status = 'canceled',
         credits_remaining = $1,
         credits_monthly_allowance = 0,
         job_analyses_remaining = $2,
         job_analyses_monthly_allowance = 0,
         training_credits_remaining = $3,
         training_credits_monthly_allowance = 0,
         is_lifetime_plan = true,
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_subscription_id = $4`,
    [freePlan.lifetimeTrainingCredits, freePlan.lifetimeJobAnalyses, freePlan.lifetimeTrainingCredits, subscription.id]
  );

  // Also check advertiser subscriptions
  await deactivateAdvertiserBySubId(subscription.id);
}

async function handleSubscriptionUpdated(subscription) {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const resolved = priceId ? PRICE_ID_TO_PLAN[priceId] : null;

  if (resolved) {
    const planDef = PLANS[resolved.plan];
    const PLAN_ORDER = ['free', 'starter', 'pro', 'elite'];

    // Get current state
    const current = await pool.query(
      'SELECT plan, training_credits_remaining, scheduled_downgrade_plan FROM subscriptions WHERE stripe_subscription_id = $1',
      [subscription.id]
    );

    if (current.rows.length > 0) {
      const currentRow = current.rows[0];

      // If this webhook was triggered by our scheduleDowngrade call,
      // only update billing dates/status — do NOT change plan or credits
      if (currentRow.scheduled_downgrade_plan && currentRow.scheduled_downgrade_plan === resolved.plan) {
        await pool.query(
          `UPDATE subscriptions
           SET billing_interval = $1,
               current_period_start = to_timestamp($2),
               current_period_end = to_timestamp($3),
               status = $4,
               updated_at = CURRENT_TIMESTAMP
           WHERE stripe_subscription_id = $5`,
          [
            resolved.interval,
            subscription.current_period_start,
            subscription.current_period_end,
            subscription.status,
            subscription.id
          ]
        );
        return;
      }

      // If resolved plan differs from both current and scheduled — portal override, clear scheduled
      if (currentRow.scheduled_downgrade_plan && resolved.plan !== currentRow.plan) {
        // Portal changed the plan to something unexpected — clear scheduled downgrade
        await pool.query(
          `UPDATE subscriptions SET scheduled_downgrade_plan = NULL, scheduled_downgrade_at = NULL WHERE stripe_subscription_id = $1`,
          [subscription.id]
        );
      }

      const isDowngrade = PLAN_ORDER.indexOf(resolved.plan) < PLAN_ORDER.indexOf(currentRow.plan);
      const newAllowance = planDef.monthlyTrainingCredits;
      const jobAnalyses = planDef.monthlyJobAnalyses === -1 ? 999999 : planDef.monthlyJobAnalyses;

      // On downgrade, clamp credits to new allowance
      const clampedCredits = isDowngrade
        ? Math.min(currentRow.training_credits_remaining || 0, newAllowance)
        : newAllowance;

      await pool.query(
        `UPDATE subscriptions
         SET plan = $1,
             billing_interval = $2,
             current_period_start = to_timestamp($3),
             current_period_end = to_timestamp($4),
             status = $5,
             training_credits_remaining = $6,
             training_credits_monthly_allowance = $7,
             job_analyses_remaining = $8,
             job_analyses_monthly_allowance = $9,
             credits_remaining = $6,
             credits_monthly_allowance = $7,
             scheduled_downgrade_plan = NULL,
             scheduled_downgrade_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE stripe_subscription_id = $10`,
        [
          resolved.plan,
          resolved.interval,
          subscription.current_period_start,
          subscription.current_period_end,
          subscription.status,
          clampedCredits,
          newAllowance,
          jobAnalyses,
          planDef.monthlyJobAnalyses,
          subscription.id
        ]
      );
      return;
    }
  }

  // Fallback: date-only update
  await pool.query(
    `UPDATE subscriptions
     SET current_period_start = to_timestamp($1),
         current_period_end = to_timestamp($2),
         status = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_subscription_id = $4`,
    [subscription.current_period_start, subscription.current_period_end, subscription.status, subscription.id]
  );

  // Also update advertiser subscription if exists
  const advSub = await getAdvertiserSubByStripeId(subscription.id);
  if (advSub) {
    await updateAdvertiserSubStatus(subscription.id, {
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: new Date(subscription.current_period_end * 1000),
      status: subscription.status
    });
  }
}

export async function getAdvertiserPriceId() {
  let priceId = process.env.STRIPE_PRICE_ID_ADVERTISER;
  if (!priceId) {
    console.log('Creating Stripe product and price for advertiser...');
    const product = await stripe.products.create({
      name: 'intrview.io Advertiser Spot',
      description: 'Monthly advertising spot on intrview.io'
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 99900,
      currency: 'usd',
      recurring: { interval: 'month' }
    });
    priceId = price.id;
    console.log(`Created Stripe advertiser price: ${priceId}`);
    console.log(`Add this to your .env: STRIPE_PRICE_ID_ADVERTISER=${priceId}`);
  }
  return priceId;
}

// Create customer portal session
export async function createPortalSession(customerId, returnUrl) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });

  return session;
}
