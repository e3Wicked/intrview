import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from './db.js';

// Plan configurations — two-bucket model: job analyses + training credits
export const PLANS = {
  free: {
    name: 'Free',
    lifetimeJobAnalyses: 3,
    lifetimeTrainingCredits: 15,
    monthlyJobAnalyses: 0,
    monthlyTrainingCredits: 0,
    isLifetime: true,
    features: {
      studyPlan: true,
      questions: true,
      flashcards: true,
      quiz: true,
      companyResearch: true,
      progressTracking: true,
      voicePractice: false,
      pdfExport: false,
      prioritySpeed: false
    }
  },
  starter: {
    name: 'Starter',
    monthlyJobAnalyses: 10,
    monthlyTrainingCredits: 150,
    price: 9,
    features: {
      studyPlan: true,
      questions: true,
      flashcards: true,
      quiz: true,
      companyResearch: true,
      progressTracking: true,
      voicePractice: false,
      pdfExport: false,
      prioritySpeed: false
    }
  },
  pro: {
    name: 'Pro',
    monthlyJobAnalyses: 30,
    monthlyTrainingCredits: 400,
    price: 19,
    features: {
      studyPlan: true,
      questions: true,
      flashcards: true,
      quiz: true,
      companyResearch: true,
      progressTracking: true,
      voicePractice: true,
      pdfExport: true,
      prioritySpeed: true
    }
  },
  elite: {
    name: 'Elite',
    monthlyJobAnalyses: -1, // unlimited
    monthlyTrainingCredits: 800,
    price: 39,
    features: {
      studyPlan: true,
      questions: true,
      flashcards: true,
      quiz: true,
      companyResearch: true,
      progressTracking: true,
      voicePractice: true,
      pdfExport: true,
      prioritySpeed: true,
      advancedInsights: true, // coming soon
      personalizedRecommendations: true, // coming soon
      customSimulation: true // coming soon
    }
  }
};

// Training credit costs per action
export const TRAINING_CREDIT_COSTS = {
  chatPractice: 1,
  focusChat: 1,
  quizEvaluation: 2,
  voiceEvaluation: 2,
  companyResearch: 3,
  studyPlan: 5,
};

// Generate 6-digit verification code
export function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create or get user without password
export async function createUserWithoutPassword(email, name) {
  try {
    // Check if user already exists (case-insensitive)
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return existingUser.rows[0]; // Return existing user
    }

    // Create new user without password
    const result = await pool.query(
      `INSERT INTO users (email, name)
       VALUES ($1, $2)
       RETURNING *`,
      [email, name || null]
    );

    const newUser = result.rows[0];

    // Check if admin user
    const isAdmin = isAdminUser(email);
    const plan = isAdmin ? 'elite' : 'free';

    // Create subscription with two-bucket model
    await createNewSubscription(newUser.id, plan);

    return newUser;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

// Save verification code
export async function saveVerificationCode(email, code) {
  try {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // Code expires in 10 minutes

    // Invalidate old codes for this email
    await pool.query(
      'UPDATE email_verification_codes SET used = true WHERE LOWER(email) = LOWER($1) AND used = false',
      [email]
    );

    // Insert new code
    await pool.query(
      `INSERT INTO email_verification_codes (email, code, expires_at)
       VALUES ($1, $2, $3)`,
      [email, code, expiresAt]
    );
  } catch (error) {
    console.error('Error saving verification code:', error);
    throw error;
  }
}

// Verify code
export async function verifyCode(email, code) {
  try {
    const result = await pool.query(
      `SELECT * FROM email_verification_codes 
       WHERE LOWER(email) = LOWER($1) 
         AND code = $2 
         AND expires_at > NOW() 
         AND used = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [email, code]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired code');
    }

    // Mark code as used
    await pool.query(
      'UPDATE email_verification_codes SET used = true WHERE id = $1',
      [result.rows[0].id]
    );

    return true;
  } catch (error) {
    console.error('Error verifying code:', error);
    throw error;
  }
}

// Create new user with password
export async function createUser(email, name, password) {
  try {
    // Check if user already exists (case-insensitive)
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create new user
    const result = await pool.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email, name, passwordHash]
    );

    const newUser = result.rows[0];

    // Check if admin user
    const isAdmin = isAdminUser(email);
    const plan = isAdmin ? 'elite' : 'free';

    // Create subscription with two-bucket model
    await createNewSubscription(newUser.id, plan);

    return newUser;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

// Verify password and get user
export async function verifyPassword(email, password) {
  try {
    // Use LOWER() for case-insensitive email comparison
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = result.rows[0];

    // Check if user has a password (might be Google OAuth user)
    if (!user.password_hash) {
      throw new Error('This account was created with Google. Please use Google sign in.');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    return user;
  } catch (error) {
    console.error('Error verifying password:', error);
    throw error;
  }
}

// Create or get user (for Google OAuth)
export async function createOrGetUser(email, name = null, googleId = null) {
  try {
    // Check if user exists by google_id first, then fall back to email
    let user;
    if (googleId) {
      const result = await pool.query(
        'SELECT * FROM users WHERE google_id = $1',
        [googleId]
      );
      user = result.rows[0];
    }

    if (!user) {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      user = result.rows[0];
    }

    if (user) {
      // Link google_id if the account didn't have one yet
      if (googleId && !user.google_id) {
        await pool.query(
          'UPDATE users SET google_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [googleId, user.id]
        );
        user.google_id = googleId;
      }
      // Update name if provided and missing
      if (name && !user.name) {
        await pool.query(
          'UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [name, user.id]
        );
        user.name = name;
      }
      return user;
    }

    // Create new user
    const result = await pool.query(
      `INSERT INTO users (email, name, google_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email, name, googleId]
    );

    const newUser = result.rows[0];

    // Create subscription with two-bucket model
    await createNewSubscription(newUser.id, 'free');

    return newUser;
  } catch (error) {
    console.error('Error creating/getting user:', error);
    throw error;
  }
}

// Create session
export async function createSession(userId) {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  await pool.query(
    `INSERT INTO user_sessions (user_id, session_token, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, sessionToken, expiresAt]
  );

  return sessionToken;
}

// Get user from session
export async function getUserFromSession(sessionToken) {
  try {
    const result = await pool.query(
      `SELECT u.*, s.plan, s.credits_remaining, s.credits_monthly_allowance,
              s.job_analyses_remaining, s.job_analyses_monthly_allowance,
              s.training_credits_remaining, s.training_credits_monthly_allowance,
              s.is_lifetime_plan, s.credits_reset_at, s.grace_period_end,
              s.stripe_customer_id, s.stripe_subscription_id, s.status as subscription_status,
              s.billing_interval, s.paused_at,
              s.scheduled_downgrade_plan, s.scheduled_downgrade_at
       FROM user_sessions us
       JOIN users u ON us.user_id = u.id
       LEFT JOIN subscriptions s ON u.id = s.user_id
       WHERE us.session_token = $1 AND us.expires_at > NOW()`,
      [sessionToken]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    const plan = PLANS[user.plan || 'free'];

    // Override for admin users
    const isAdmin = isAdminUser(user.email);

    const adminFeatures = {
      studyPlan: true, questions: true, flashcards: true, quiz: true,
      companyResearch: true, progressTracking: true, voicePractice: true,
      pdfExport: true, prioritySpeed: true, advancedInsights: true,
      personalizedRecommendations: true, customSimulation: true
    };

    const finalPlanDetails = isAdmin
      ? { ...plan, features: adminFeatures }
      : plan;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan || 'free',
      planDetails: finalPlanDetails,
      // Legacy single-bucket fields (kept for compat)
      creditsRemaining: isAdmin ? 999999 : (user.credits_remaining || 0),
      creditsMonthlyAllowance: isAdmin ? 999999 : (user.credits_monthly_allowance || 0),
      // Two-bucket fields
      jobAnalysesRemaining: isAdmin ? 999999 : (user.job_analyses_remaining || 0),
      jobAnalysesMonthlyAllowance: isAdmin ? -1 : (user.job_analyses_monthly_allowance || 0),
      trainingCreditsRemaining: isAdmin ? 999999 : (user.training_credits_remaining || 0),
      trainingCreditsMonthlyAllowance: isAdmin ? 999999 : (user.training_credits_monthly_allowance || 0),
      isLifetimePlan: user.is_lifetime_plan || false,
      stripeCustomerId: user.stripe_customer_id,
      stripeSubscriptionId: user.stripe_subscription_id,
      creditsResetAt: user.is_lifetime_plan ? null : (user.credits_reset_at || null),
      gracePeriodEnd: user.grace_period_end || null,
      subscriptionStatus: user.subscription_status,
      billingInterval: user.billing_interval || 'month',
      scheduledDowngradePlan: user.scheduled_downgrade_plan || null,
      scheduledDowngradeAt: user.scheduled_downgrade_at || null,
      isAdmin: isAdmin
    };
  } catch (error) {
    console.error('Error getting user from session:', error);
    return null;
  }
}

// Admin/test emails that get unlimited credits
const ADMIN_EMAILS = [
  'admin@intrview.io',
  'test@intrview.io',
  'alberto@intrview.io' // Add your email here
];

// Check if user is admin
export function isAdminUser(email) {
  return ADMIN_EMAILS.includes(email?.toLowerCase());
}

// Check feature access
export function hasFeatureAccess(userPlan, feature, userEmail = null) {
  // Admin users have access to all features
  if (userEmail && isAdminUser(userEmail)) {
    return true;
  }
  const plan = PLANS[userPlan || 'free'];
  return plan.features[feature] || false;
}

// Middleware to require authentication
export function requireAuth(req, res, next) {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '') || 
                       req.cookies?.session_token;

  if (!sessionToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  getUserFromSession(sessionToken).then(user => {
    if (!user) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    req.user = user;
    next();
  }).catch(error => {
    res.status(500).json({ error: 'Authentication error' });
  });
}

// Middleware to require admin
export function requireAdmin(req, res, next) {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '') ||
                       req.cookies?.session_token;

  if (!sessionToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  getUserFromSession(sessionToken).then(user => {
    if (!user) return res.status(401).json({ error: 'Invalid session' });
    if (!isAdminUser(user.email)) return res.status(403).json({ error: 'Admin access required' });
    req.user = user;
    next();
  }).catch(() => {
    res.status(500).json({ error: 'Authentication error' });
  });
}

// ==================== TWO-BUCKET CREDIT SYSTEM ====================

// Helper to create a new subscription row with correct bucket values
export async function createNewSubscription(userId, planKey) {
  const isAdmin = (await pool.query('SELECT email FROM users WHERE id = $1', [userId])).rows[0]?.email;
  const admin = isAdmin && isAdminUser(isAdmin);
  const plan = PLANS[planKey] || PLANS.free;

  let jobAnalyses, jobAllowance, trainingCredits, trainingAllowance, isLifetime;

  if (admin) {
    jobAnalyses = 999999; jobAllowance = -1;
    trainingCredits = 999999; trainingAllowance = 999999;
    isLifetime = false;
  } else if (planKey === 'free') {
    jobAnalyses = plan.lifetimeJobAnalyses;
    jobAllowance = 0;
    trainingCredits = plan.lifetimeTrainingCredits;
    trainingAllowance = 0;
    isLifetime = true;
  } else {
    jobAnalyses = plan.monthlyJobAnalyses === -1 ? 999999 : plan.monthlyJobAnalyses;
    jobAllowance = plan.monthlyJobAnalyses;
    trainingCredits = plan.monthlyTrainingCredits;
    trainingAllowance = plan.monthlyTrainingCredits;
    isLifetime = false;
  }

  // Also set legacy credits columns for backwards compat
  const legacyCredits = admin ? 999999 : (planKey === 'free' ? 15 : (plan.monthlyTrainingCredits || 0));

  await pool.query(
    `INSERT INTO subscriptions (
      user_id, plan, credits_remaining, credits_monthly_allowance, credits_reset_at,
      job_analyses_remaining, job_analyses_monthly_allowance,
      training_credits_remaining, training_credits_monthly_allowance,
      is_lifetime_plan
    ) VALUES ($1, $2, $3, $3, ${isLifetime ? 'NULL' : "CURRENT_TIMESTAMP + INTERVAL '30 days'"}, $4, $5, $6, $7, $8)`,
    [userId, planKey, legacyCredits, jobAnalyses, jobAllowance, trainingCredits, trainingAllowance, isLifetime]
  );
}

// Check if user has job analyses remaining
export async function checkJobAnalyses(userId) {
  const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length > 0 && isAdminUser(userResult.rows[0].email)) {
    return { hasAnalyses: true, remaining: 999999 };
  }

  const result = await pool.query(
    'SELECT job_analyses_remaining, job_analyses_monthly_allowance FROM subscriptions WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) return { hasAnalyses: false, remaining: 0 };

  const { job_analyses_remaining, job_analyses_monthly_allowance } = result.rows[0];
  // allowance -1 means unlimited
  if (job_analyses_monthly_allowance === -1) return { hasAnalyses: true, remaining: 999999 };

  return { hasAnalyses: (job_analyses_remaining || 0) >= 1, remaining: job_analyses_remaining || 0 };
}

// Atomically deduct one job analysis
export async function deductJobAnalysis(userId) {
  const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length > 0 && isAdminUser(userResult.rows[0].email)) return 999999;

  // Skip deduction for unlimited plans
  const allowance = await pool.query(
    'SELECT job_analyses_monthly_allowance FROM subscriptions WHERE user_id = $1', [userId]
  );
  if (allowance.rows[0]?.job_analyses_monthly_allowance === -1) return 999999;

  const result = await pool.query(
    `UPDATE subscriptions
     SET job_analyses_remaining = job_analyses_remaining - 1, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND job_analyses_remaining >= 1
     RETURNING job_analyses_remaining`,
    [userId]
  );

  if (result.rows.length === 0) throw new Error('Failed to deduct job analysis');
  return result.rows[0].job_analyses_remaining;
}

// Check if user has enough training credits
export async function checkTrainingCredits(userId, cost) {
  const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length > 0 && isAdminUser(userResult.rows[0].email)) {
    return { hasCredits: true, remaining: 999999 };
  }

  const result = await pool.query(
    'SELECT training_credits_remaining FROM subscriptions WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) return { hasCredits: false, remaining: 0 };

  const remaining = result.rows[0].training_credits_remaining || 0;
  return { hasCredits: remaining >= cost, remaining };
}

// Atomically deduct training credits
export async function deductTrainingCredits(userId, cost) {
  const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length > 0 && isAdminUser(userResult.rows[0].email)) return 999999;

  const result = await pool.query(
    `UPDATE subscriptions
     SET training_credits_remaining = training_credits_remaining - $2, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND training_credits_remaining >= $2
     RETURNING training_credits_remaining`,
    [userId, cost]
  );

  if (result.rows.length === 0) throw new Error('Failed to deduct training credits');
  return result.rows[0].training_credits_remaining;
}

// Check grace period and auto-downgrade if expired
export async function checkAndEnforceGracePeriod(userId) {
  const result = await pool.query(
    'SELECT status, grace_period_end, plan FROM subscriptions WHERE user_id = $1',
    [userId]
  );
  if (result.rows.length === 0) return { downgraded: false };

  const { status, grace_period_end, plan } = result.rows[0];
  if (status !== 'past_due' || !grace_period_end) return { downgraded: false };
  if (new Date(grace_period_end) > new Date()) return { downgraded: false };

  // Grace period expired — downgrade to free
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
         payment_failed_at = NULL,
         grace_period_end = NULL,
         dunning_emails_sent = 0,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $4`,
    [freePlan.lifetimeTrainingCredits, freePlan.lifetimeJobAnalyses, freePlan.lifetimeTrainingCredits, userId]
  );

  return { downgraded: true };
}

// Middleware: require a job analysis
export function requireJobAnalysis() {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const graceCheck = await checkAndEnforceGracePeriod(req.user.id);
    if (graceCheck.downgraded) {
      return res.status(402).json({ error: 'Subscription canceled due to payment failure', downgraded: true, upgradeRequired: true });
    }

    const { hasAnalyses, remaining } = await checkJobAnalyses(req.user.id);
    if (!hasAnalyses) {
      return res.status(402).json({
        error: 'No job analyses remaining',
        resourceType: 'jobAnalyses',
        remaining,
        upgradeRequired: true
      });
    }
    next();
  };
}

// Middleware: require training credits for a given action
export function requireTrainingCredits(action) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const graceCheck = await checkAndEnforceGracePeriod(req.user.id);
    if (graceCheck.downgraded) {
      return res.status(402).json({ error: 'Subscription canceled due to payment failure', downgraded: true, upgradeRequired: true });
    }

    const cost = TRAINING_CREDIT_COSTS[action];
    if (cost === undefined) return res.status(500).json({ error: `Unknown action: ${action}` });

    const { hasCredits, remaining } = await checkTrainingCredits(req.user.id, cost);
    if (!hasCredits) {
      return res.status(402).json({
        error: 'Insufficient training credits',
        resourceType: 'trainingCredits',
        remaining,
        required: cost,
        upgradeRequired: true
      });
    }
    req.trainingCreditCost = cost;
    next();
  };
}

