import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database pool before importing auth module
vi.mock('../db.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Mock bcrypt to avoid native module issues in tests
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

const { pool } = await import('../db.js');
const {
  PLANS,
  TRAINING_CREDIT_COSTS,
  isAdminUser,
  hasFeatureAccess,
  generateVerificationCode,
  checkAndEnforceGracePeriod,
  requireJobAnalysis,
  requireTrainingCredits,
} = await import('../auth.js');

describe('PLANS configuration', () => {
  it('should define four plan tiers', () => {
    expect(Object.keys(PLANS)).toEqual(['free', 'starter', 'pro', 'elite']);
  });

  it('should give free plan 15 lifetime training credits', () => {
    expect(PLANS.free.lifetimeTrainingCredits).toBe(15);
  });

  it('should give free plan 3 lifetime job analyses', () => {
    expect(PLANS.free.lifetimeJobAnalyses).toBe(3);
  });

  it('should give elite plan unlimited job analyses (-1)', () => {
    expect(PLANS.elite.monthlyJobAnalyses).toBe(-1);
  });

  it('should increase training credits with each paid tier', () => {
    expect(PLANS.pro.monthlyTrainingCredits).toBeGreaterThan(PLANS.starter.monthlyTrainingCredits);
    expect(PLANS.elite.monthlyTrainingCredits).toBeGreaterThan(PLANS.pro.monthlyTrainingCredits);
  });

  it('should not give free plan voice practice access', () => {
    expect(PLANS.free.features.voicePractice).toBe(false);
  });

  it('should give pro plan voice practice access', () => {
    expect(PLANS.pro.features.voicePractice).toBe(true);
  });

  it('should give all plans basic features', () => {
    for (const planKey of Object.keys(PLANS)) {
      const plan = PLANS[planKey];
      expect(plan.features.studyPlan).toBe(true);
      expect(plan.features.questions).toBe(true);
      expect(plan.features.flashcards).toBe(true);
      expect(plan.features.quiz).toBe(true);
      expect(plan.features.companyResearch).toBe(true);
      expect(plan.features.progressTracking).toBe(true);
    }
  });
});

describe('TRAINING_CREDIT_COSTS', () => {
  it('should define costs for all expected actions', () => {
    expect(TRAINING_CREDIT_COSTS).toHaveProperty('studyPlan');
    expect(TRAINING_CREDIT_COSTS).toHaveProperty('companyResearch');
    expect(TRAINING_CREDIT_COSTS).toHaveProperty('quizEvaluation');
    expect(TRAINING_CREDIT_COSTS).toHaveProperty('voiceEvaluation');
    expect(TRAINING_CREDIT_COSTS).toHaveProperty('chatPractice');
    expect(TRAINING_CREDIT_COSTS).toHaveProperty('focusChat');
  });

  it('should have studyPlan as the most expensive action', () => {
    const maxCost = Math.max(...Object.values(TRAINING_CREDIT_COSTS));
    expect(TRAINING_CREDIT_COSTS.studyPlan).toBe(maxCost);
  });

  it('should have all positive integer costs', () => {
    for (const [action, cost] of Object.entries(TRAINING_CREDIT_COSTS)) {
      expect(cost).toBeGreaterThan(0);
      expect(Number.isInteger(cost)).toBe(true);
    }
  });
});

describe('isAdminUser', () => {
  it('should return true for known admin emails', () => {
    expect(isAdminUser('admin@intrview.io')).toBe(true);
    expect(isAdminUser('test@intrview.io')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isAdminUser('Admin@intrview.io')).toBe(true);
    expect(isAdminUser('ADMIN@INTRVIEW.IO')).toBe(true);
  });

  it('should return false for non-admin emails', () => {
    expect(isAdminUser('user@example.com')).toBe(false);
    expect(isAdminUser('random@intrview.io')).toBe(false);
  });

  it('should handle null/undefined gracefully', () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
  });
});

describe('hasFeatureAccess', () => {
  it('should grant basic features to free plan', () => {
    expect(hasFeatureAccess('free', 'studyPlan')).toBe(true);
    expect(hasFeatureAccess('free', 'quiz')).toBe(true);
  });

  it('should deny premium features to free plan', () => {
    expect(hasFeatureAccess('free', 'voicePractice')).toBe(false);
    expect(hasFeatureAccess('free', 'pdfExport')).toBe(false);
  });

  it('should grant premium features to pro plan', () => {
    expect(hasFeatureAccess('pro', 'voicePractice')).toBe(true);
    expect(hasFeatureAccess('pro', 'pdfExport')).toBe(true);
  });

  it('should always grant access to admin users regardless of plan', () => {
    expect(hasFeatureAccess('free', 'voicePractice', 'admin@intrview.io')).toBe(true);
    expect(hasFeatureAccess('free', 'pdfExport', 'admin@intrview.io')).toBe(true);
  });

  it('should default to free plan if plan is null/undefined', () => {
    expect(hasFeatureAccess(null, 'quiz')).toBe(true);
    expect(hasFeatureAccess(undefined, 'voicePractice')).toBe(false);
  });

  it('should return false for unknown features', () => {
    expect(hasFeatureAccess('free', 'nonExistentFeature')).toBe(false);
  });
});

describe('generateVerificationCode', () => {
  it('should return a 6-digit string', () => {
    const code = generateVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('should return different codes on subsequent calls', () => {
    const codes = new Set();
    for (let i = 0; i < 20; i++) {
      codes.add(generateVerificationCode());
    }
    // With 20 random 6-digit codes, duplicates are extremely unlikely
    expect(codes.size).toBeGreaterThan(15);
  });
});

describe('checkAndEnforceGracePeriod', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return not downgraded when no subscription exists', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await checkAndEnforceGracePeriod(1);
    expect(result.downgraded).toBe(false);
  });

  it('should return not downgraded when status is active', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ status: 'active', grace_period_end: null, plan: 'pro' }],
    });

    const result = await checkAndEnforceGracePeriod(1);
    expect(result.downgraded).toBe(false);
  });

  it('should return not downgraded when grace period has not expired', async () => {
    const futureDate = new Date(Date.now() + 3 * 86400000).toISOString();
    pool.query.mockResolvedValueOnce({
      rows: [{ status: 'past_due', grace_period_end: futureDate, plan: 'pro' }],
    });

    const result = await checkAndEnforceGracePeriod(1);
    expect(result.downgraded).toBe(false);
  });

  it('should downgrade to free when grace period has expired', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    pool.query
      .mockResolvedValueOnce({
        rows: [{ status: 'past_due', grace_period_end: pastDate, plan: 'pro' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE result

    const result = await checkAndEnforceGracePeriod(1);
    expect(result.downgraded).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});

// Helper: create a minimal Express-like req/res/next triple
function makeReqResNext(userOverrides = {}) {
  const req = {
    user: {
      id: 42,
      email: 'user@example.com',
      subscriptionStatus: 'active',
      ...userOverrides,
    },
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('requireJobAnalysis middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when req.user is missing', async () => {
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await requireJobAnalysis()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 402 with downgraded:true when grace period has expired', async () => {
    const { req, res, next } = makeReqResNext({ subscriptionStatus: 'past_due' });
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    // checkAndEnforceGracePeriod: SELECT returns expired grace period
    pool.query
      .mockResolvedValueOnce({
        rows: [{ status: 'past_due', grace_period_end: pastDate, plan: 'pro' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE to free

    await requireJobAnalysis()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ downgraded: true, upgradeRequired: true })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 402 with upgradeRequired when no job analyses remain', async () => {
    const { req, res, next } = makeReqResNext();

    // checkAndEnforceGracePeriod: active, no issue
    pool.query.mockResolvedValueOnce({ rows: [{ status: 'active', grace_period_end: null }] });
    // checkJobAnalyses: user not admin (email query)
    pool.query.mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] });
    // checkJobAnalyses: subscription query returns 0 remaining
    pool.query.mockResolvedValueOnce({
      rows: [{ job_analyses_remaining: 0, job_analyses_monthly_allowance: 10 }],
    });

    await requireJobAnalysis()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'jobAnalyses', upgradeRequired: true })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when subscription is active and analyses remain', async () => {
    const { req, res, next } = makeReqResNext();

    // checkAndEnforceGracePeriod: active
    pool.query.mockResolvedValueOnce({ rows: [{ status: 'active', grace_period_end: null }] });
    // checkJobAnalyses: email check (non-admin)
    pool.query.mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] });
    // checkJobAnalyses: 5 remaining
    pool.query.mockResolvedValueOnce({
      rows: [{ job_analyses_remaining: 5, job_analyses_monthly_allowance: 10 }],
    });

    await requireJobAnalysis()(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireTrainingCredits middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when req.user is missing', async () => {
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await requireTrainingCredits('chatPractice')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 500 for unknown action name', async () => {
    const { req, res, next } = makeReqResNext();

    // checkAndEnforceGracePeriod: no issue
    pool.query.mockResolvedValueOnce({ rows: [{ status: 'active', grace_period_end: null }] });

    await requireTrainingCredits('unknownAction')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 402 with downgraded:true when grace period has expired', async () => {
    const { req, res, next } = makeReqResNext({ subscriptionStatus: 'past_due' });
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    pool.query
      .mockResolvedValueOnce({
        rows: [{ status: 'past_due', grace_period_end: pastDate, plan: 'pro' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE to free

    await requireTrainingCredits('studyPlan')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ downgraded: true })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 402 when training credits are insufficient', async () => {
    const { req, res, next } = makeReqResNext();

    // checkAndEnforceGracePeriod: no issue
    pool.query.mockResolvedValueOnce({ rows: [{ status: 'active', grace_period_end: null }] });
    // checkTrainingCredits: email (non-admin)
    pool.query.mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] });
    // checkTrainingCredits: 1 credit remaining, studyPlan costs 5
    pool.query.mockResolvedValueOnce({ rows: [{ training_credits_remaining: 1 }] });

    await requireTrainingCredits('studyPlan')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'trainingCredits',
        required: TRAINING_CREDIT_COSTS.studyPlan,
        upgradeRequired: true,
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() and set req.trainingCreditCost when credits are sufficient', async () => {
    const { req, res, next } = makeReqResNext();

    // checkAndEnforceGracePeriod: no issue
    pool.query.mockResolvedValueOnce({ rows: [{ status: 'active', grace_period_end: null }] });
    // checkTrainingCredits: email (non-admin)
    pool.query.mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] });
    // checkTrainingCredits: 10 credits remaining, chatPractice costs 1
    pool.query.mockResolvedValueOnce({ rows: [{ training_credits_remaining: 10 }] });

    await requireTrainingCredits('chatPractice')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.trainingCreditCost).toBe(TRAINING_CREDIT_COSTS.chatPractice);
    expect(res.status).not.toHaveBeenCalled();
  });
});
