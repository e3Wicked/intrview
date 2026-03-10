import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Stripe SDK
const mockStripe = {
  customers: { create: vi.fn() },
  products: { create: vi.fn() },
  prices: { create: vi.fn() },
  subscriptions: {
    retrieve: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  },
  checkout: {
    sessions: { create: vi.fn() },
  },
  billingPortal: {
    sessions: { create: vi.fn() },
  },
};

vi.mock('stripe', () => ({
  default: vi.fn(() => mockStripe),
}));

vi.mock('../db.js', () => ({
  pool: { query: vi.fn() },
}));

// Set env so stripe initializes
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const { pool } = await import('../db.js');
const {
  createCheckoutSession,
  upgradeSubscription,
  getPriceIdForPlan,
  handleWebhook,
} = await import('../stripe.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPriceIdForPlan', () => {
  it('should return price ID from env var when set', async () => {
    process.env.STRIPE_PRICE_ID_PRO = 'price_env_pro';
    const priceId = await getPriceIdForPlan('pro');
    expect(priceId).toBe('price_env_pro');
    delete process.env.STRIPE_PRICE_ID_PRO;
  });

  it('should auto-create product and price when env var missing', async () => {
    delete process.env.STRIPE_PRICE_ID_STARTER;
    mockStripe.products.create.mockResolvedValueOnce({ id: 'prod_1' });
    mockStripe.prices.create.mockResolvedValueOnce({ id: 'price_auto_1' });

    const priceId = await getPriceIdForPlan('starter');
    expect(priceId).toBe('price_auto_1');
    expect(mockStripe.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Starter Plan' })
    );
  });

  it('should throw on invalid plan', async () => {
    await expect(getPriceIdForPlan('invalid')).rejects.toThrow('Invalid plan');
  });

  it('should throw on free plan (no price)', async () => {
    await expect(getPriceIdForPlan('free')).rejects.toThrow('Invalid plan');
  });
});

describe('createCheckoutSession', () => {
  it('should throw on invalid plan', async () => {
    await expect(createCheckoutSession(1, 'invalid', 'http://ok', 'http://cancel'))
      .rejects.toThrow('Invalid plan');
  });

  it('should create Stripe customer when none exists', async () => {
    // No existing customer
    pool.query
      .mockResolvedValueOnce({ rows: [{}] }) // no stripe_customer_id
      .mockResolvedValueOnce({ rows: [{ email: 'test@test.com', name: 'Test' }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE customer ID

    mockStripe.customers.create.mockResolvedValueOnce({ id: 'cus_new' });

    process.env.STRIPE_PRICE_ID_STARTER = 'price_starter';
    mockStripe.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_1',
      url: 'https://checkout.stripe.com/1',
    });

    const session = await createCheckoutSession(1, 'starter', 'http://ok', 'http://cancel');
    expect(mockStripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@test.com' })
    );
    expect(session.url).toBe('https://checkout.stripe.com/1');
    delete process.env.STRIPE_PRICE_ID_STARTER;
  });

  it('should reuse existing Stripe customer ID', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_existing' }] });

    process.env.STRIPE_PRICE_ID_PRO = 'price_pro';
    mockStripe.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_2',
      url: 'https://checkout.stripe.com/2',
    });

    await createCheckoutSession(1, 'pro', 'http://ok', 'http://cancel');
    expect(mockStripe.customers.create).not.toHaveBeenCalled();
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing' })
    );
    delete process.env.STRIPE_PRICE_ID_PRO;
  });

  it('should create a subscription-mode checkout session', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] });

    process.env.STRIPE_PRICE_ID_STARTER = 'price_starter';
    mockStripe.checkout.sessions.create.mockResolvedValueOnce({ id: 'cs_3', url: 'http://url' });

    await createCheckoutSession(1, 'starter', 'http://ok', 'http://cancel');
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        success_url: 'http://ok',
        cancel_url: 'http://cancel',
      })
    );
    delete process.env.STRIPE_PRICE_ID_STARTER;
  });
});

describe('upgradeSubscription', () => {
  it('should throw on invalid plan', async () => {
    await expect(upgradeSubscription(1, 'invalid')).rejects.toThrow('Invalid plan');
  });

  it('should throw when no existing subscription', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await expect(upgradeSubscription(1, 'pro')).rejects.toThrow('No active subscription to upgrade');
  });

  it('should update subscription with new price and update DB', async () => {
    // DB: existing subscription
    pool.query.mockResolvedValueOnce({ rows: [{ stripe_subscription_id: 'sub_old' }] });

    // Stripe: retrieve current subscription
    mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
      id: 'sub_old',
      items: { data: [{ id: 'si_item1' }] },
    });

    // Price lookup
    process.env.STRIPE_PRICE_ID_PRO = 'price_pro';

    // Stripe: update subscription
    mockStripe.subscriptions.update.mockResolvedValueOnce({
      id: 'sub_old',
      current_period_start: 1700000000,
      current_period_end: 1702600000,
    });

    // DB: update plan
    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await upgradeSubscription(1, 'pro');

    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_old', {
      items: [{ id: 'si_item1', price: 'price_pro' }],
      proration_behavior: 'create_prorations',
    });

    // Verify DB update was called with correct plan
    expect(pool.query).toHaveBeenCalledTimes(2);
    const dbCall = pool.query.mock.calls[1];
    expect(dbCall[1][0]).toBe('pro'); // plan name
    expect(dbCall[1][7]).toBe(1); // userId

    expect(result.id).toBe('sub_old');
    delete process.env.STRIPE_PRICE_ID_PRO;
  });

  it('should set correct credit values for elite plan (unlimited job analyses)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ stripe_subscription_id: 'sub_1' }] });
    mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
      id: 'sub_1',
      items: { data: [{ id: 'si_1' }] },
    });
    process.env.STRIPE_PRICE_ID_ELITE = 'price_elite';
    mockStripe.subscriptions.update.mockResolvedValueOnce({
      id: 'sub_1',
      current_period_start: 1700000000,
      current_period_end: 1702600000,
    });
    pool.query.mockResolvedValueOnce({ rows: [] });

    await upgradeSubscription(1, 'elite');

    const dbCall = pool.query.mock.calls[1];
    expect(dbCall[1][0]).toBe('elite');
    expect(dbCall[1][4]).toBe(999999); // job_analyses_remaining (unlimited → 999999)
    expect(dbCall[1][6]).toBe(800); // training_credits_remaining
    delete process.env.STRIPE_PRICE_ID_ELITE;
  });
});

describe('handleWebhook', () => {
  it('should handle checkout.session.completed', async () => {
    mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
      current_period_start: 1700000000,
      current_period_end: 1702600000,
    });
    pool.query.mockResolvedValueOnce({ rows: [] });

    await handleWebhook({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId: '1', plan: 'starter' },
          subscription: 'sub_new',
        },
      },
    });

    expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_new');
    expect(pool.query).toHaveBeenCalledTimes(1);
    const dbCall = pool.query.mock.calls[0];
    expect(dbCall[1][0]).toBe('starter');
    expect(dbCall[1][1]).toBe('sub_new');
  });

  it('should handle invoice.payment_failed', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await handleWebhook({
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_fail' } },
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'past_due'"),
      ['sub_fail']
    );
  });

  it('should handle customer.subscription.deleted', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await handleWebhook({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_del' } },
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("plan = 'free'"),
      expect.arrayContaining(['sub_del'])
    );
  });

  it('should handle customer.subscription.updated', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await handleWebhook({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_upd',
          current_period_start: 1700000000,
          current_period_end: 1702600000,
          status: 'active',
        },
      },
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('current_period_start'),
      [1700000000, 1702600000, 'active', 'sub_upd']
    );
  });

  it('should handle invoice.payment_succeeded and reset credits', async () => {
    mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
      current_period_start: 1700000000,
      current_period_end: 1702600000,
    });
    pool.query.mockResolvedValueOnce({
      rows: [{ user_id: 5, plan: 'pro' }],
    });
    pool.query.mockResolvedValueOnce({ rows: [] });

    await handleWebhook({
      type: 'invoice.payment_succeeded',
      data: { object: { subscription: 'sub_pay' } },
    });

    expect(pool.query).toHaveBeenCalledTimes(2);
    const updateCall = pool.query.mock.calls[1];
    expect(updateCall[1][0]).toBe(400); // pro training credits
    expect(updateCall[1][4]).toBe(30); // pro job analyses
  });
});
