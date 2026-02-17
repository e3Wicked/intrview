import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from './db.js';

// Plan configurations
export const PLANS = {
  free: {
    name: 'Free',
    monthlyCredits: 15,
    monthlyJobAnalyses: 1,
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
    monthlyCredits: 120,
    monthlyJobAnalyses: 3,
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
    monthlyCredits: 300,
    monthlyJobAnalyses: -1, // unlimited
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
    monthlyCredits: 600,
    monthlyJobAnalyses: -1, // unlimited
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

// Credit costs for different actions
export const CREDIT_COSTS = {
  companyInfo: 2,
  studyPlan: 5,
  companyResearch: 3,
  quizEvaluation: 1,
  voiceEvaluation: 2
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

    // Check if admin user - give unlimited credits
    const isAdmin = isAdminUser(email);
    const plan = isAdmin ? 'elite' : 'free';
    const credits = isAdmin ? 999999 : PLANS.free.monthlyCredits;
    const resetInterval = isAdmin ? '365 days' : '30 days';

    // Create subscription
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, credits_remaining, credits_monthly_allowance, credits_reset_at)
       VALUES ($1, $2, $3, $3, CURRENT_TIMESTAMP + INTERVAL '${resetInterval}')`,
      [newUser.id, plan, credits]
    );

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

    // Check if admin user - give unlimited credits
    const isAdmin = isAdminUser(email);
    const plan = isAdmin ? 'elite' : 'free';
    const credits = isAdmin ? 999999 : PLANS.free.monthlyCredits;
    const resetInterval = isAdmin ? '365 days' : '30 days';

    // Create subscription
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, credits_remaining, credits_monthly_allowance, credits_reset_at)
       VALUES ($1, $2, $3, $3, CURRENT_TIMESTAMP + INTERVAL '${resetInterval}')`,
      [newUser.id, plan, credits]
    );

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
    // Check if user exists
    let user;
    if (googleId) {
      const result = await pool.query(
        'SELECT * FROM users WHERE google_id = $1',
        [googleId]
      );
      user = result.rows[0];
    } else {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      user = result.rows[0];
    }

    if (user) {
      // Update name if provided
      if (name && name !== user.name) {
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

    // Create free subscription
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, credits_remaining, credits_monthly_allowance, credits_reset_at)
       VALUES ($1, 'free', $2, $2, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      [newUser.id, PLANS.free.monthlyCredits]
    );

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
              s.stripe_customer_id, s.stripe_subscription_id, s.status as subscription_status
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
    
    // Override credits and features for admin users
    const isAdmin = isAdminUser(user.email);
    const creditsRemaining = isAdmin ? 999999 : (user.credits_remaining || 0);
    const creditsMonthlyAllowance = isAdmin ? 999999 : (user.credits_monthly_allowance || 0);
    
    // Admin users get all features enabled
    const adminFeatures = {
      studyPlan: true,
      questions: true,
      flashcards: true,
      quiz: true,
      companyResearch: true,
      progressTracking: true,
      voicePractice: true,
      pdfExport: true,
      prioritySpeed: true,
      advancedInsights: true,
      personalizedRecommendations: true,
      customSimulation: true
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
      creditsRemaining: creditsRemaining,
      creditsMonthlyAllowance: creditsMonthlyAllowance,
      stripeCustomerId: user.stripe_customer_id,
      stripeSubscriptionId: user.stripe_subscription_id,
      subscriptionStatus: user.subscription_status,
      isAdmin: isAdmin // Add flag for frontend use
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

// Check if user has enough credits
export async function checkCredits(userId, actionCost) {
  // Get user email to check if admin
  const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length > 0 && isAdminUser(userResult.rows[0].email)) {
    return { hasCredits: true, remaining: 999999 }; // Admin users have unlimited credits
  }
  
  const result = await pool.query(
    'SELECT credits_remaining FROM subscriptions WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return { hasCredits: false, remaining: 0 };
  }

  const remaining = result.rows[0].credits_remaining || 0;
  return {
    hasCredits: remaining >= actionCost,
    remaining
  };
}

// Deduct credits
export async function deductCredits(userId, amount) {
  // Get user email to check if admin
  const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length > 0 && isAdminUser(userResult.rows[0].email)) {
    // Admin users don't have credits deducted
    const adminSub = await pool.query('SELECT credits_remaining FROM subscriptions WHERE user_id = $1', [userId]);
    return adminSub.rows[0]?.credits_remaining || 999999;
  }
  
  const result = await pool.query(
    `UPDATE subscriptions 
     SET credits_remaining = credits_remaining - $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND credits_remaining >= $2
     RETURNING credits_remaining`,
    [userId, amount]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Failed to deduct credits - user subscription not found or insufficient credits');
  }
  
  return result.rows[0].credits_remaining;
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

// Middleware to require credits
export function requireCredits(actionCost) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { hasCredits, remaining } = await checkCredits(req.user.id, actionCost);
    
    if (!hasCredits) {
      return res.status(402).json({ 
        error: 'Insufficient credits',
        remaining,
        required: actionCost,
        upgradeRequired: true
      });
    }

    req.creditCost = actionCost;
    next();
  };
}

