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
  CREDIT_COSTS,
  isAdminUser,
  hasFeatureAccess,
  generateVerificationCode,
  checkCredits,
  deductCredits,
} = await import('../auth.js');

describe('PLANS configuration', () => {
  it('should define four plan tiers', () => {
    expect(Object.keys(PLANS)).toEqual(['free', 'starter', 'pro', 'elite']);
  });

  it('should give free plan 15 monthly credits', () => {
    expect(PLANS.free.monthlyCredits).toBe(15);
  });

  it('should give free plan 1 monthly job analysis', () => {
    expect(PLANS.free.monthlyJobAnalyses).toBe(1);
  });

  it('should give pro plan unlimited job analyses (-1)', () => {
    expect(PLANS.pro.monthlyJobAnalyses).toBe(-1);
  });

  it('should increase credits with each tier', () => {
    expect(PLANS.starter.monthlyCredits).toBeGreaterThan(PLANS.free.monthlyCredits);
    expect(PLANS.pro.monthlyCredits).toBeGreaterThan(PLANS.starter.monthlyCredits);
    expect(PLANS.elite.monthlyCredits).toBeGreaterThan(PLANS.pro.monthlyCredits);
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

describe('CREDIT_COSTS', () => {
  it('should define costs for all expected actions', () => {
    expect(CREDIT_COSTS).toHaveProperty('companyInfo');
    expect(CREDIT_COSTS).toHaveProperty('studyPlan');
    expect(CREDIT_COSTS).toHaveProperty('companyResearch');
    expect(CREDIT_COSTS).toHaveProperty('quizEvaluation');
    expect(CREDIT_COSTS).toHaveProperty('voiceEvaluation');
    expect(CREDIT_COSTS).toHaveProperty('chatPractice');
    expect(CREDIT_COSTS).toHaveProperty('focusChat');
  });

  it('should have studyPlan as the most expensive action', () => {
    const maxCost = Math.max(...Object.values(CREDIT_COSTS));
    expect(CREDIT_COSTS.studyPlan).toBe(maxCost);
  });

  it('should have all positive integer costs', () => {
    for (const [action, cost] of Object.entries(CREDIT_COSTS)) {
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

describe('checkCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return unlimited credits for admin users', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ email: 'admin@intrview.io' }],
    });

    const result = await checkCredits(1, 5);
    expect(result.hasCredits).toBe(true);
    expect(result.remaining).toBe(999999);
  });

  it('should return true when user has enough credits', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
      .mockResolvedValueOnce({ rows: [{ credits_remaining: 50 }] });

    const result = await checkCredits(1, 5);
    expect(result.hasCredits).toBe(true);
    expect(result.remaining).toBe(50);
  });

  it('should return false when user lacks credits', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
      .mockResolvedValueOnce({ rows: [{ credits_remaining: 3 }] });

    const result = await checkCredits(1, 5);
    expect(result.hasCredits).toBe(false);
    expect(result.remaining).toBe(3);
  });

  it('should return false when user has no subscription', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await checkCredits(1, 5);
    expect(result.hasCredits).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe('deductCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not deduct credits for admin users', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ email: 'admin@intrview.io' }] })
      .mockResolvedValueOnce({ rows: [{ credits_remaining: 999999 }] });

    const remaining = await deductCredits(1, 5);
    expect(remaining).toBe(999999);
    // Should not have called the UPDATE query
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('should deduct credits for regular users', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
      .mockResolvedValueOnce({ rows: [{ credits_remaining: 45 }] });

    const remaining = await deductCredits(1, 5);
    expect(remaining).toBe(45);
  });

  it('should throw when deduction fails (insufficient credits)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(deductCredits(1, 5)).rejects.toThrow('Failed to deduct credits');
  });
});
