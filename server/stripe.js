import Stripe from 'stripe';
import { pool } from './db.js';
import { PLANS } from './auth.js';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️  STRIPE_SECRET_KEY not set. Stripe features will not work.');
}

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

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

// Create checkout session
export async function createCheckoutSession(userId, planKey, successUrl, cancelUrl) {
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

  // Get price ID from environment or create it
  // In production, store these in your database
  let priceId = process.env[`STRIPE_PRICE_ID_${planKey.toUpperCase()}`];
  
  if (!priceId) {
    // Auto-create product and price if not exists
    console.log(`Creating Stripe product and price for ${planKey}...`);
    try {
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
      
      priceId = price.id;
      console.log(`✅ Created Stripe price for ${planKey}: ${priceId}`);
      console.log(`💡 Add this to your .env: STRIPE_PRICE_ID_${planKey.toUpperCase()}=${priceId}`);
    } catch (error) {
      console.error('Error creating Stripe product/price:', error);
      throw new Error(`Failed to create Stripe price: ${error.message}`);
    }
  }

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
      plan: planKey
    }
  });

  return session;
}

// Handle webhook events
export async function handleWebhook(event) {
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
  const userId = parseInt(session.metadata.userId);
  const plan = session.metadata.plan;
  const subscriptionId = session.subscription;
  
  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  await pool.query(
    `UPDATE subscriptions 
     SET plan = $1,
         stripe_subscription_id = $2,
         status = 'active',
         current_period_start = to_timestamp($3),
         current_period_end = to_timestamp($4),
         credits_remaining = $5,
         credits_monthly_allowance = $5,
         credits_reset_at = to_timestamp($4),
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $6`,
    [
      plan,
      subscriptionId,
      subscription.current_period_start,
      subscription.current_period_end,
      PLANS[plan].monthlyCredits,
      userId
    ]
  );
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
    
    // Reset credits to monthly allowance
    await pool.query(
      `UPDATE subscriptions 
       SET credits_remaining = $1,
           credits_monthly_allowance = $1,
           credits_reset_at = to_timestamp($2),
           current_period_start = to_timestamp($3),
           current_period_end = to_timestamp($4),
           status = 'active',
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $5`,
      [
        PLANS[plan].monthlyCredits,
        subscription.current_period_end,
        subscription.current_period_start,
        subscription.current_period_end,
        user_id
      ]
    );
  }
}

async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  
  await pool.query(
    `UPDATE subscriptions 
     SET status = 'past_due',
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );
}

async function handleSubscriptionDeleted(subscription) {
  await pool.query(
    `UPDATE subscriptions 
     SET plan = 'free',
         status = 'canceled',
         credits_remaining = $1,
         credits_monthly_allowance = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_subscription_id = $2`,
    [PLANS.free.monthlyCredits, subscription.id]
  );
}

async function handleSubscriptionUpdated(subscription) {
  await pool.query(
    `UPDATE subscriptions 
     SET current_period_start = to_timestamp($1),
         current_period_end = to_timestamp($2),
         status = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_subscription_id = $4`,
    [
      subscription.current_period_start,
      subscription.current_period_end,
      subscription.status,
      subscription.id
    ]
  );
}

// Create customer portal session
export async function createPortalSession(customerId, returnUrl) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });
  
  return session;
}

