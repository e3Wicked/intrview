import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Readable } from 'stream';
import bcrypt from 'bcrypt';
import { pool } from './db.js';
import { 
  getCompanyFullData, 
  saveCompanyInfo, 
  saveCompanyResearch,
  getCachedStudyPlan,
  saveStudyPlan,
  hashJobDescription,
  getCachedJobUrl,
  saveJobUrlCache,
  getActiveAdvertisers,
  getOrCreateAdvertiser,
  updateAdvertiserLogo,
  scrapeJobCountFromCareersPage,
  updateAdvertiserJobCount,
  trackJobAnalysis,
  getUserJobAnalyses,
  getUserStats,
  findStudyPlanByCompanyRole,
  getOrCreateTopic,
  linkTopicsToJob,
  getUserTopicScores,
  updateUserTopicScore,
  getTopicsForJob,
  getSharedTopicsAcrossJobs,
  getAllUserTopics,
  findSimilarUserTopic,
  normalizeTopicName,
  saveDrillSession,
  getDrillSessions,
  getAllDrillSessions
} from './db.js';
import {
  createUser,
  verifyPassword,
  createOrGetUser,
  createSession,
  getUserFromSession,
  checkCredits,
  deductCredits,
  hasFeatureAccess,
  requireAuth,
  requireAdmin,
  requireCredits,
  isAdminUser,
  CREDIT_COSTS,
  PLANS,
  generateVerificationCode,
  createUserWithoutPassword,
  saveVerificationCode,
  verifyCode,
  TRAINING_CREDIT_COSTS,
  checkJobAnalyses,
  deductJobAnalysis,
  checkTrainingCredits,
  deductTrainingCredits,
  requireJobAnalysis,
  requireTrainingCredits,
  createNewSubscription
} from './auth.js';
import { sendVerificationCode } from './email.js';
import Stripe from 'stripe';
import practiceRouter, { recordAttempt } from './routes/practice.js';
import mockInterviewRouter from './routes/mock-interview.js';
import { 
  createCheckoutSession, 
  handleWebhook, 
  createPortalSession 
} from './stripe.js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
import cookieParser from 'cookie-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the server directory
dotenv.config({ path: path.join(__dirname, '.env') });

// Infer topic category from name using keyword heuristics
function inferTopicCategory(topicName) {
  const lower = topicName.toLowerCase();
  if (/system design|architecture|scalab|distributed/i.test(lower)) return 'system_design';
  if (/algorithm|data structure|sorting|graph|tree|dynamic programming|leetcode/i.test(lower)) return 'algorithms';
  if (/behavioral|leadership|teamwork|conflict|communication/i.test(lower)) return 'behavioral';
  if (/react|vue|angular|css|html|frontend|front-end|ui\/ux/i.test(lower)) return 'frontend';
  if (/node|express|django|flask|backend|back-end|api design|rest|graphql/i.test(lower)) return 'backend';
  if (/sql|database|postgres|mongo|redis|caching/i.test(lower)) return 'databases';
  if (/docker|kubernetes|ci\/cd|devops|aws|gcp|azure|cloud|infrastructure/i.test(lower)) return 'devops';
  if (/machine learning|ml|ai|deep learning|nlp|computer vision/i.test(lower)) return 'ml';
  if (/security|authentication|encryption|oauth/i.test(lower)) return 'security';
  if (/testing|tdd|unit test|integration test|qa/i.test(lower)) return 'testing';
  if (/python|javascript|typescript|java|go|rust|c\+\+|ruby|swift|kotlin/i.test(lower)) return 'language';
  if (/product|pm|roadmap|metrics|a\/b test|user research/i.test(lower)) return 'product';
  return 'general';
}

// Detect company-specific topics that shouldn't be drillable
function isCompanySpecificTopic(topicName, companyName = null) {
  const lower = topicName.toLowerCase()
  if (/\b(culture\s*(and|&)\s*values|company\s*(fit|culture)|corporate\s*values|mission\s*(and|&)\s*values)\b/.test(lower)) return true
  if (companyName) {
    const comp = companyName.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${comp}\\b.*(culture|values|mission|principles|fit)`, 'i').test(lower)) return true
    if (new RegExp(`(culture|values|mission|principles|fit).*\\b${comp}\\b`, 'i').test(lower)) return true
  }
  return false
}

// Parse seniority level from role title and job description
function parseSeniority(roleTitle, jobDescription = '') {
  const title = (roleTitle || '').toLowerCase();
  const desc = (jobDescription || '').toLowerCase();

  // Check role title for level indicators
  let level = 'mid';
  if (/\b(intern|internship)\b/.test(title)) level = 'intern';
  else if (/\b(junior|jr\.?|entry[- ]level|associate)\b/.test(title)) level = 'junior';
  else if (/\b(staff|principal)\b/.test(title)) level = 'staff';
  else if (/\b(lead|architect|head|director|vp|vice president)\b/.test(title)) level = 'lead';
  else if (/\b(senior|sr\.?)\b/.test(title)) level = 'senior';
  else if (/\b(mid[- ]?level|mid[- ]?senior)\b/.test(title)) level = 'mid';

  // Parse years of experience from job description
  let yearsHint = null;
  const yearsMatch = desc.match(/(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)/i);
  if (yearsMatch) {
    yearsHint = parseInt(yearsMatch[1], 10);
    // If title didn't give a clear signal, infer from years
    if (level === 'mid') {
      if (yearsHint >= 10) level = 'staff';
      else if (yearsHint >= 6) level = 'senior';
      else if (yearsHint <= 2) level = 'junior';
    }
  }

  const labels = {
    intern: 'Intern-level',
    junior: 'Junior-level',
    mid: 'Mid-level',
    senior: 'Senior-level',
    staff: 'Staff/Principal-level',
    lead: 'Lead/Director-level',
  };

  return { level, yearsHint, label: labels[level] || 'Mid-level' };
}

const app = express();
const PORT = process.env.PORT || 5001;

// Create HTTPS agent that accepts self-signed certificates
let httpsAgent = null;
const getHttpsAgent = async () => {
  if (!httpsAgent) {
    const https = await import('https');
    httpsAgent = new https.Agent({
      rejectUnauthorized: false // Accept self-signed certificates to avoid SSL errors
    });
  }
  return httpsAgent;
};

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '500kb' }));
app.use(cookieParser());

// --- In-memory rate limiter ---
const rateLimitStore = new Map();

function rateLimit(userId, action, maxRequests, windowMs) {
  const key = `${userId}:${action}`;
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    entry = { windowStart: now, count: 0 };
    rateLimitStore.set(key, entry);
  }

  entry.count++;

  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.windowStart > 600_000) {
      rateLimitStore.delete(key);
    }
  }
}, 600_000);

// Log all API requests for debugging
app.use('/api', (req, res, next) => {
  console.log(`\n[🔍 API Middleware] ${req.method} ${req.path}`);
  console.log(`[🔍 API Middleware] Full URL: ${req.url}`);
  console.log(`[🔍 API Middleware] Original URL: ${req.originalUrl}`);
  console.log(`[🔍 API Middleware] Timestamp: ${new Date().toISOString()}\n`);
  next();
});

// API routes must be defined BEFORE static file serving
// (Static file serving is moved to the end, after all API routes)

// ==================== AUTHENTICATION ENDPOINTS (DEFINED FIRST) ====================

// Get current user
app.get('/api/auth/me', async (req, res) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.session_token;
    
    if (!sessionToken) {
      return res.json({ user: null });
    }
    
    const user = await getUserFromSession(sessionToken);
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Request verification code (passwordless auth)
console.log('[SERVER STARTUP] Registering /api/auth/request-code route...');
try {
  app.post('/api/auth/request-code', async (req, res) => {
  console.log('[REQUEST-CODE] Route hit!', req.method, req.path, req.body);
  try {
    const { email, name, isSignIn } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // If this is a sign-in attempt, check if user exists first
    if (isSignIn) {
      const userCheck = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
      );
      
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'No account found with this email. Please sign up first.' });
      }
    }

    // Generate 6-digit code
    const code = generateVerificationCode();
    
    // Save code to database
    await saveVerificationCode(email, code);
    
    // Send email with code
    await sendVerificationCode(email, code);
    
    console.log(`[AUTH] Verification code sent to ${email}${process.env.NODE_ENV !== 'production' ? ` (code: ${code})` : ''}`);
    
    res.json({ 
      success: true, 
      message: 'Verification code sent to your email',
      // In development, return the code for testing
      ...(process.env.NODE_ENV !== 'production' && { code })
    });
  } catch (error) {
    console.error('[AUTH ERROR]', error);
    if (error.response) {
      return res.status(error.response.status).json({ error: error.response.data?.error || error.message });
    }
    res.status(500).json({ error: error.message || 'Failed to send verification code' });
  }
  });
  console.log('[SERVER STARTUP] ✅ /api/auth/request-code route registered successfully');
} catch (err) {
  console.error('[SERVER STARTUP] ❌ ERROR registering /api/auth/request-code route:', err);
  throw err;
}

// Verify code and login/signup (passwordless auth)
app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const { email, code, name } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    // Verify code
    await verifyCode(email, code);
    
    // Create or get user (no password needed)
    const user = await createUserWithoutPassword(email, name);
    
    // Create session
    const sessionToken = await createSession(user.id);
    
    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    
    const userWithPlan = await getUserFromSession(sessionToken);
    
    console.log(`[AUTH] User ${user.email} verified and logged in`);
    
    res.json({ 
      success: true, 
      user: userWithPlan,
      sessionToken 
    });
  } catch (error) {
    console.error('[AUTH ERROR]', error);
    const statusCode = error.message.includes('Invalid') || error.message.includes('expired') ? 401 : 500;
    res.status(statusCode).json({ error: error.message || 'Verification failed' });
  }
});

// Legacy endpoints (kept for backward compatibility, but deprecated)
// Sign up with email and password
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password is required and must be at least 6 characters' });
    }
    
    console.log('[SIGNUP] Attempting to create user:', email);
    const user = await createUser(email, name, password);
    console.log('[SIGNUP] User created:', user.id);
    
    const sessionToken = await createSession(user.id);
    console.log('[SIGNUP] Session created');
    
    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    
    const userWithPlan = await getUserFromSession(sessionToken);
    
    res.json({ 
      success: true, 
      user: userWithPlan,
      sessionToken 
    });
  } catch (error) {
    console.error('[SIGNUP ERROR]', error);
    
    let errorMessage = error.message || 'Internal server error';
    let statusCode = 500;
    
    // Handle specific errors
    if (error.message.includes('already exists')) {
      statusCode = 409; // Conflict
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Database connection refused. Please ensure PostgreSQL is running and the database is set up. See server/DATABASE_SETUP.md for instructions.';
    } else if (error.code === '42P01') {
      errorMessage = 'Database table does not exist. Please run the setup script: psql -U postgres -d interview_prepper -f server/setup-db.sql';
    } else if (error.code === '3D000') {
      errorMessage = 'Database does not exist. Please create it: createdb interview_prepper';
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      code: error.code
    });
  }
});

// Login with email and password
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    console.log('[LOGIN] Attempting to verify user:', email);
    const user = await verifyPassword(email, password);
    console.log('[LOGIN] Password verified for user:', user.id);
    
    const sessionToken = await createSession(user.id);
    console.log('[LOGIN] Session created');
    
    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    
    const userWithPlan = await getUserFromSession(sessionToken);
    
    res.json({ 
      success: true, 
      user: userWithPlan,
      sessionToken 
    });
  } catch (error) {
    console.error('[LOGIN ERROR]', error);
    
    const statusCode = error.message.includes('Invalid') ? 401 : 500;
    
    res.status(statusCode).json({ 
      error: error.message || 'Login failed. Please check your credentials and try again.'
    });
  }
});

// Google OAuth callback (GET) - redirects to Google OAuth or handles callback
app.get('/api/auth/google', async (req, res) => {
  try {
    // In a real implementation, this would redirect to Google OAuth
    // For now, return an error asking to use the POST endpoint
    // Or you can implement a simple mock flow here
    res.status(400).json({ 
      error: 'Google OAuth not fully implemented. Please use email/password signup for now.',
      message: 'To implement Google OAuth, you need to set up Google OAuth credentials and use the POST endpoint with Google ID token.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login with Google (POST - receives Google ID token)
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential token is required' });
    }

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, sub: googleId } = payload;

    const user = await createOrGetUser(email, name, googleId);
    const sessionToken = await createSession(user.id);

    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const userWithPlan = await getUserFromSession(sessionToken);

    res.json({ success: true, user: userWithPlan, sessionToken });
  } catch (error) {
    console.error('Google auth error:', error.message);
    console.error('GOOGLE_CLIENT_ID set:', !!process.env.GOOGLE_CLIENT_ID);
    res.status(401).json({ error: 'Google authentication failed', detail: error.message });
  }
});

// Logout
app.post('/api/auth/logout', async (req, res) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.session_token;
    
    // Delete session from database if token exists
    if (sessionToken) {
      await pool.query(
        'DELETE FROM user_sessions WHERE session_token = $1',
        [sessionToken]
      );
    }
    
    // Clear cookie
    res.clearCookie('session_token');
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    // Still clear cookie even if DB deletion fails
    res.clearCookie('session_token');
    res.json({ success: true });
  }
});

// ==================== END AUTHENTICATION ENDPOINTS ====================

// Initialize OpenAI client (lazy initialization)
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Function to extract company name from job description
function extractCompanyName(jobDescription, url) {
  // Common words to exclude (false positives) - expanded list
  const excludeWords = ['you', 'your', 'we', 'our', 'us', 'the', 'this', 'that', 'job', 'position', 'role', 
    'company', 'team', 'organization', 'firm', 'startup', 'will', 'are', 'is', 'have', 'has', 'can', 'may',
    'join', 'working', 'hiring', 'seeking', 'looking', 'for', 'with', 'at', 'and', 'or', 'but'];
  
  // Try to extract from URL domain first (most reliable)
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    const domainParts = hostname.split('.');
    
    // Skip common job board domains
    const jobBoardDomains = ['linkedin', 'indeed', 'glassdoor', 'monster', 'ziprecruiter', 'jobs', 'careers', 'greenhouse', 'lever', 'workday'];
    const firstPart = domainParts[0]?.toLowerCase();
    
    if (domainParts.length > 0 && !jobBoardDomains.includes(firstPart)) {
      const domainName = domainParts[0];
      // Capitalize properly
      const companyName = domainName.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      
      if (companyName.length > 1) {
        console.log('Extracted company name from URL:', companyName);
        return companyName;
      }
    }
  } catch (e) {
    // Ignore URL parsing errors
  }
  
  // Try to find company name in job description using better patterns
  // Look for patterns like "Company Name is hiring" or "at Company Name"
  const betterPatterns = [
    // Pattern: "at Company Name" or "with Company Name"
    /(?:at|with|@)\s+([A-Z][a-zA-Z0-9&\.-]{3,40}(?:\s+[A-Z][a-zA-Z0-9&\.-]{0,20})*?)(?:\s|$|,|\.|!|\?|;|,)/g,
    // Pattern: "Company Name is" or "Company Name seeks"
    /([A-Z][a-zA-Z0-9&\.-]{3,40}(?:\s+[A-Z][a-zA-Z0-9&\.-]{0,20})*?)\s+(?:is|are|seeks|looking|hiring|seeking|hires)/g,
    // Pattern: "Company: Company Name"
    /(?:company|organization|firm|startup):\s*([A-Z][a-zA-Z0-9&\.-]{3,40}(?:\s+[A-Z][a-zA-Z0-9&\.-]{0,20})*?)(?:\s|$|,|\.)/gi,
  ];
  
  for (const pattern of betterPatterns) {
    const matches = jobDescription.matchAll(pattern);
    for (const match of matches) {
      if (match && match[1]) {
        let name = match[1].trim();
        // Remove trailing punctuation
        name = name.replace(/[.,;!?]+$/, '');
        const nameLower = name.toLowerCase();
        
        // More strict filtering
        const words = nameLower.split(/\s+/);
        const isExcluded = words.some(word => 
          excludeWords.includes(word) || 
          word.length < 2 ||
          word === 'us' || word === 'us.'
        );
        
        if (!isExcluded && 
            name.length >= 3 && 
            name.length < 50 && 
            !nameLower.includes('job') && 
            !nameLower.includes('position') &&
            !nameLower.includes('role') &&
            !nameLower.includes('you will') &&
            !nameLower.includes('you are') &&
            !nameLower.includes('join us') &&
            !nameLower.includes('with us')) {
          console.log('Extracted company name from job description:', name);
          return name;
        }
      }
    }
  }
  
  // Last resort: try to find capitalized words that look like company names
  // Look for patterns of 2-4 capitalized words in a row
  const companyNamePattern = /\b([A-Z][a-zA-Z0-9&\.-]{2,20}(?:\s+[A-Z][a-zA-Z0-9&\.-]{2,20}){0,3})\b/g;
  const potentialNames = [];
  for (const match of jobDescription.matchAll(companyNamePattern)) {
    if (match[1]) {
      const name = match[1].trim();
      const nameLower = name.toLowerCase();
      const words = nameLower.split(/\s+/);
      
      // Skip if it contains excluded words
      if (!words.some(word => excludeWords.includes(word) || word.length < 2) &&
          name.length >= 3 && name.length < 50 &&
          !nameLower.includes('job') && !nameLower.includes('position') && !nameLower.includes('role')) {
        potentialNames.push(name);
      }
    }
  }
  
  // Return the first reasonable candidate
  if (potentialNames.length > 0) {
    console.log('Extracted company name from capitalized words:', potentialNames[0]);
    return potentialNames[0];
  }
  
  return null;
}

// Function to scrape job description via Jina Reader (renders JS, returns markdown)
async function scrapeWithJina(url) {
  try {
    const response = await axios.get(`https://r.jina.ai/${encodeURIComponent(url)}`, {
      headers: {
        'Accept': 'text/markdown',
        'X-Return-Format': 'markdown',
      },
      timeout: 15000,
      maxContentLength: 2_000_000,
    });
    const text = typeof response.data === 'string' ? response.data.trim() : '';
    const MAX_JINA_LENGTH = 50_000;
    const truncatedText = text.length > MAX_JINA_LENGTH ? text.substring(0, MAX_JINA_LENGTH) : text;
    if (truncatedText.length > 100) {
      console.log(`Jina Reader returned ${text.length} chars (using ${truncatedText.length})`);
      return truncatedText;
    }
    return null;
  } catch (err) {
    console.log('Jina Reader failed (non-critical):', err.message);
    return null;
  }
}

// Function to validate scraped content is actually a job posting
async function validateJobContent(text) {
  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You classify web page content. Your job is to determine if this text is a SINGLE, specific job posting.

Rules:
- A single job posting page commonly includes navigation, headers, footers, "similar jobs", "recommended", or "people also viewed" sections — this is STILL a single job posting. Focus on whether the page contains ONE primary job with details like title, company, and responsibilities.
- Classify as "multiple_jobs" ONLY if the page is purely a job search results page or job feed — a flat list of equal job cards with NO single featured/primary job.
- If the text is mostly login prompts or empty app shell with no job details at all, classify as "error_page"
- When in doubt, classify as "single_job" — downstream checks will catch bad content

Respond with JSON: { "isJobPosting": boolean, "confidence": "high"|"medium"|"low", "contentType": "single_job"|"multiple_jobs"|"error_page"|"company_page"|"other", "reason": "brief explanation" }`
        },
        {
          role: 'user',
          content: `Is this a single job posting?\n\n${text.substring(0, 3000)}`
        }
      ],
      temperature: 0,
      max_tokens: 120,
      response_format: { type: 'json_object' },
    });
    return JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    console.log('Job content validation failed (non-critical):', err.message);
    return { isJobPosting: true, confidence: 'low', contentType: 'unknown', reason: 'validation unavailable' };
  }
}

// Blocklist of known false-positive company/role names from UI elements
const COMPANY_NAME_BLOCKLIST = new Set([
  'email', 'apply', 'share', 'sign in', 'sign up', 'linkedin', 'indeed',
  'glassdoor', 'save', 'report', 'show more', 'join', 'log in', 'home',
  'jobs', 'join now', 'similar jobs', 'people also viewed', 'unknown',
  'report this job', 'save job', 'apply now', 'easy apply'
]);

function validateCompanyName(name) {
  if (!name || name.length < 2) return null;
  const cleaned = name.replace(/^["']|["']$/g, '').trim();
  if (COMPANY_NAME_BLOCKLIST.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function cleanJobContent(text) {
  const noisePatterns = [
    /^(Email|Share|Save|Apply|Sign In|Sign Up|Report|Log In|Join Now|Home|Jobs|Similar Jobs|People Also Viewed|Show More|Show Less|Easy Apply|Apply Now|Report This Job|Save Job|Cookie|Accept|Decline|Privacy|Skip to main content)\s*$/gim,
    /^(Like|Comment|Repost|Send|Copy link|Share via)\s*$/gim,
    /^\d+\s*(applicants?|views?|clicks?)\s*$/gim,
    /^(Posted|Reposted)\s+\d+\s+(days?|weeks?|months?|hours?)\s+ago\s*$/gim,
  ];
  let cleaned = text;
  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

// Function to scrape job description from URL
async function scrapeJobDescription(url) {
  try {
    // Start Jina fetch in parallel with cheerio fetch
    const jinaPromise = scrapeWithJina(url);

    const agent = await getHttpsAgent();

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      httpsAgent: agent,
      timeout: 30000,
      maxContentLength: 2_000_000,
    });
    
    const $ = cheerio.load(response.data);
    
    // Try to extract company logo - more comprehensive selectors
    let logo = null;
    let companyWebsite = null;
    let linkedinCompanyUrl = null;
    
    // First, try to find LinkedIn company URL (best source for logos)
    // Pattern: linkedin.com/company/[company-name]
    $('a[href]').each((i, elem) => {
      const href = $(elem).attr('href');
      if (href && href.includes('linkedin.com/company/')) {
        try {
          // Handle both absolute and relative URLs
          let linkedinUrl;
          if (href.startsWith('http')) {
            linkedinUrl = new URL(href);
          } else {
            linkedinUrl = new URL(href, url);
          }
          
          // Verify it's a LinkedIn company URL
          if (linkedinUrl.hostname.includes('linkedin.com') && 
              linkedinUrl.pathname.match(/^\/company\/[^\/]+/)) {
            // Extract clean company URL: linkedin.com/company/[name]
            const pathMatch = linkedinUrl.pathname.match(/^\/company\/([^\/\?]+)/);
            if (pathMatch) {
              linkedinCompanyUrl = `https://www.linkedin.com/company/${pathMatch[1]}`;
              console.log('Found LinkedIn company URL:', linkedinCompanyUrl);
              return false; // Break the loop
            }
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      }
    });
    
    // Also check in meta tags and structured data
    if (!linkedinCompanyUrl) {
      const metaLinkedIn = $('meta[property="og:url"]').attr('content');
      if (metaLinkedIn && metaLinkedIn.includes('linkedin.com/company/')) {
        try {
          const linkedinUrl = new URL(metaLinkedIn);
          const pathMatch = linkedinUrl.pathname.match(/^\/company\/([^\/\?]+)/);
          if (pathMatch) {
            linkedinCompanyUrl = `https://www.linkedin.com/company/${pathMatch[1]}`;
            console.log('Found LinkedIn company URL from meta:', linkedinCompanyUrl);
          }
        } catch (e) {
          // Ignore
        }
      }
    }
    
    // Try to find company website URL in the page
    const websiteSelectors = [
      'a[href*="company"]',
      'a[href*="about"]',
      '[class*="company-website"]',
      '[class*="company-url"]',
    ];
    
    for (const selector of websiteSelectors) {
      const element = $(selector).first();
      if (element.length) {
        const href = element.attr('href');
        if (href && (href.includes('http') || href.includes('www'))) {
          try {
            const websiteUrl = new URL(href, url);
            if (websiteUrl.hostname && !websiteUrl.hostname.includes('linkedin') && 
                !websiteUrl.hostname.includes('indeed') && !websiteUrl.hostname.includes('glassdoor')) {
              companyWebsite = websiteUrl.origin;
              break;
            }
          } catch (e) {
            // Ignore invalid URLs
          }
        }
      }
    }
    
    // Also try to extract from meta tags or structured data
    const metaWebsite = $('meta[property="og:url"]').attr('content') || 
                        $('link[rel="canonical"]').attr('href');
    if (metaWebsite && !metaWebsite.includes('linkedin') && !metaWebsite.includes('indeed')) {
      try {
        const websiteUrl = new URL(metaWebsite);
        companyWebsite = websiteUrl.origin;
      } catch (e) {
        // Ignore
      }
    }
    
    // Try to extract company logo with comprehensive selectors from job posting page
    // Job boards usually have company logos prominently displayed
    const logoSelectors = [
      // Meta tags first (most reliable)
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[property="og:image:url"]',
      // Common job board logo patterns
      'img[alt*="logo" i]',
      'img[alt*="company" i]',
      'img[class*="logo" i]',
      'img[class*="company-logo" i]',
      'img[class*="employer-logo" i]',
      'img[class*="brand-logo" i]',
      'img[id*="logo" i]',
      'img[data-testid*="logo" i]',
      // Container-based selectors
      '.logo img',
      '.company-logo img',
      '.employer-logo img',
      '.brand-logo img',
      '[class*="logo"] img',
      '[class*="company-logo"] img',
      '[class*="employer-logo"] img',
      '[class*="brand-logo"] img',
      '[id*="logo"] img',
      // LinkedIn specific
      '[class*="jobs-company__box"] img',
      '[class*="jobs-company-logo"] img',
      // Greenhouse specific
      '[class*="company-logo"]',
      // Lever specific
      '[class*="logo"]',
      // Generic patterns
      'header img[src*="logo"]',
      'header img[src*="company"]',
      '[role="banner"] img',
      'nav img',
    ];
    
    // Try all selectors and collect potential logos
    const potentialLogos = [];
    for (const selector of logoSelectors) {
      const elements = $(selector);
      elements.each((i, elem) => {
        const $elem = $(elem);
        let logoUrl = $elem.attr('src') || 
                     $elem.attr('content') || 
                     $elem.attr('data-src') ||
                     $elem.attr('data-lazy-src') ||
                     $elem.attr('data-original');
        
        // Try to extract from style background-image
        if (!logoUrl && $elem.attr('style')) {
          const styleMatch = $elem.attr('style').match(/url\(['"]?([^'")]+)['"]?\)/);
          if (styleMatch) {
            logoUrl = styleMatch[1];
          }
        }
        
        if (logoUrl) {
          // Convert relative URLs to absolute
          if (!logoUrl.startsWith('http')) {
            try {
              const baseUrl = new URL(url);
              logoUrl = new URL(logoUrl, baseUrl.origin).href;
            } catch (e) {
              return; // Skip invalid URLs
            }
          }
          
          // Filter out common non-logo images
          const lowerUrl = logoUrl.toLowerCase();
          if (!lowerUrl.includes('avatar') && 
              !lowerUrl.includes('profile') && 
              !lowerUrl.includes('user') &&
              !lowerUrl.includes('placeholder') &&
              (logoUrl.match(/\.(jpg|jpeg|png|gif|svg|webp)/i) || 
               lowerUrl.includes('logo') || 
               lowerUrl.includes('company') ||
               lowerUrl.includes('brand'))) {
            potentialLogos.push({
              url: logoUrl,
              priority: selector.includes('meta') ? 1 : 
                      selector.includes('logo') || selector.includes('company') ? 2 : 3
            });
          }
        }
      });
    }
    
    // Sort by priority and use the best one
    if (potentialLogos.length > 0) {
      potentialLogos.sort((a, b) => a.priority - b.priority);
      logo = potentialLogos[0].url;
      console.log(`✅ Found logo from job posting page: ${logo}`);
    }
    
    // Try to get logo from company website if we have it
    if (companyWebsite && !logo) {
      try {
        console.log('Trying to fetch logo from company website:', companyWebsite);
        const websiteResponse = await axios.get(companyWebsite, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 5000,
          maxRedirects: 3
        });
        
        const $website = cheerio.load(websiteResponse.data);
        const websiteLogoSelectors = [
          'link[rel="icon"]',
          'link[rel="shortcut icon"]',
          'link[rel="apple-touch-icon"]',
          'meta[property="og:image"]',
          'meta[name="twitter:image"]',
          'img[alt*="logo" i]',
          '.logo img',
          '[class*="logo"] img',
        ];
        
        for (const selector of websiteLogoSelectors) {
          const element = $website(selector).first();
          if (element.length) {
            let websiteLogo = element.attr('href') || element.attr('content') || element.attr('src');
            if (websiteLogo) {
              if (!websiteLogo.startsWith('http')) {
                websiteLogo = new URL(websiteLogo, companyWebsite).href;
              }
              if (websiteLogo.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)/i) || websiteLogo.includes('logo')) {
                logo = websiteLogo;
                console.log('Found logo from company website:', logo);
                break;
              }
            }
          }
        }
      } catch (e) {
        console.log('Could not fetch from company website:', e.message);
      }
    }

    // If we found LinkedIn company URL but no logo, try to get logo from LinkedIn (best quality)
    if (linkedinCompanyUrl && !logo) {
      try {
        console.log('Fetching logo from LinkedIn company page:', linkedinCompanyUrl);
        const linkedinResponse = await axios.get(linkedinCompanyUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: 8000,
          maxRedirects: 5
        });
        const $linkedin = cheerio.load(linkedinResponse.data);
        
        // LinkedIn company page logo selectors (based on actual LinkedIn structure)
        const linkedinLogoSelectors = [
          // Try meta tags first (most reliable)
          'meta[property="og:image"]',
          'meta[name="twitter:image"]',
          // Then try image elements
          'img[alt*="logo" i]',
          'img[class*="logo" i]',
          'img[class*="company-logo" i]',
          'img[class*="org-top-card-logo" i]',
          'img[data-testid*="logo" i]',
          '[class*="company-logo"] img',
          '[class*="org-top-card"] img',
          '[class*="org-top-card-logo"] img',
          // LinkedIn often uses background images
          '[style*="background-image"]',
        ];
        
        for (const selector of linkedinLogoSelectors) {
          const element = $linkedin(selector).first();
          if (element.length) {
            // Try different attributes
            logo = element.attr('src') || 
                   element.attr('content') || 
                   element.attr('data-src') ||
                   element.attr('data-delayed-url');
            
            // Try to extract from style background-image
            if (!logo && element.attr('style')) {
              const styleMatch = element.attr('style').match(/url\(['"]?([^'")]+)['"]?\)/);
              if (styleMatch) {
                logo = styleMatch[1];
              }
            }
            
            if (logo) {
              // Convert relative URLs to absolute
              if (!logo.startsWith('http')) {
                logo = new URL(logo, linkedinCompanyUrl).href;
              }
              // LinkedIn logos are usually high quality - validate it looks like an image
              if (logo.includes('logo') || logo.includes('image') || logo.includes('media') || 
                  logo.match(/\.(jpg|jpeg|png|gif|svg|webp)/i) ||
                  logo.includes('linkedin-media')) {
                console.log('Found logo from LinkedIn:', logo);
                break;
              }
            }
          }
        }
        
        // If still no logo, try to find in JSON-LD structured data
        if (!logo) {
          $linkedin('script[type="application/ld+json"]').each((i, elem) => {
            try {
              const jsonData = JSON.parse($linkedin(elem).html());
              if (jsonData.logo || (jsonData.image && typeof jsonData.image === 'string')) {
                logo = jsonData.logo || jsonData.image;
                if (logo && !logo.startsWith('http')) {
                  logo = new URL(logo, linkedinCompanyUrl).href;
                }
                console.log('Found logo from LinkedIn JSON-LD:', logo);
                return false; // Break
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          });
        }
      } catch (e) {
        // If LinkedIn fetch fails, continue without it
        console.log('Could not fetch LinkedIn company page for logo:', e.message);
      }
    }
    
    // If still no logo, try to fetch from company website directly
    if (!logo && companyWebsite) {
      try {
        console.log('Fetching logo from company website:', companyWebsite);
        const websiteResponse = await axios.get(companyWebsite, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 5000,
          maxRedirects: 3
        });
        
        const $website = cheerio.load(websiteResponse.data);
        const websiteLogoSelectors = [
          'meta[property="og:image"]',
          'meta[name="twitter:image"]',
          'link[rel="apple-touch-icon"]',
          'img[alt*="logo" i]',
          'img[class*="logo" i]',
          '.logo img',
          '[class*="logo"] img',
          'header img',
          'nav img',
        ];
        
        for (const selector of websiteLogoSelectors) {
          const element = $website(selector).first();
          if (element.length) {
            let websiteLogo = element.attr('src') || 
                             element.attr('content') || 
                             element.attr('href') ||
                             element.attr('data-src');
            
            if (websiteLogo) {
              if (!websiteLogo.startsWith('http')) {
                websiteLogo = new URL(websiteLogo, companyWebsite).href;
              }
              // Filter out favicons and small icons
              const lowerLogo = websiteLogo.toLowerCase();
              if (!lowerLogo.includes('favicon') && 
                  !lowerLogo.includes('icon') &&
                  (websiteLogo.match(/\.(jpg|jpeg|png|gif|svg|webp)/i) || 
                   lowerLogo.includes('logo') || 
                   lowerLogo.includes('brand'))) {
                logo = websiteLogo;
                console.log('✅ Found logo from company website:', logo);
                break;
              }
            }
          }
        }
      } catch (e) {
        console.log('Could not fetch logo from company website:', e.message);
      }
    }
    
    // Final fallback: Use logo.dev API (free up to 500k/month)
    if (!logo && companyWebsite) {
      try {
        // Extract domain from company website
        const domain = new URL(companyWebsite).hostname.replace('www.', '');
        // logo.dev API format: https://logo.dev/{domain}
        const logoApiUrl = `https://logo.dev/${domain}`;
        
        // Try GET request to check if logo exists (logo.dev returns 200 with image or 404)
        try {
          const agent = await getHttpsAgent();
          const logoResponse = await axios.get(logoApiUrl, { 
            timeout: 5000, 
            validateStatus: (status) => status < 500,
            responseType: 'arraybuffer',
            maxContentLength: 5000000, // 5MB max
            httpsAgent: agent
          });
          
          // Check if we got an actual image (not an error page)
          if (logoResponse.status === 200 && logoResponse.data) {
            const contentType = logoResponse.headers['content-type'] || '';
            if (contentType.startsWith('image/')) {
              logo = logoApiUrl;
              console.log('✅ Found logo from logo.dev API:', logo);
            }
          }
        } catch (getError) {
          // If GET fails, try HEAD as fallback
          try {
            const agent = await getHttpsAgent();
            const logoCheck = await axios.head(logoApiUrl, { 
              timeout: 3000, 
              validateStatus: (status) => status < 500,
              httpsAgent: agent
            });
            if (logoCheck.status === 200) {
              logo = logoApiUrl;
              console.log('✅ Found logo from logo.dev API (HEAD):', logo);
            }
          } catch (headError) {
            console.log(`logo.dev API not available for domain: ${domain}`);
          }
        }
      } catch (e) {
        console.log('logo.dev API error:', e.message);
      }
    }
    
    // Extract JSON-LD structured data before removing scripts
    let structuredCompanyName = null;
    let structuredRoleTitle = null;
    let structuredCompanyUrl = null;
    try {
      $('script[type="application/ld+json"]').each((i, elem) => {
        try {
          const data = JSON.parse($(elem).html());
          // Handle both direct objects and arrays
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item['@type'] === 'JobPosting') {
              if (item.hiringOrganization?.name) {
                structuredCompanyName = item.hiringOrganization.name;
              }
              if (item.hiringOrganization?.url) {
                structuredCompanyUrl = item.hiringOrganization.url;
              }
              if (item.title) {
                structuredRoleTitle = item.title;
              }
              if (structuredCompanyName) return false; // break .each()
            }
          }
        } catch (parseErr) {
          // Invalid JSON-LD, skip
        }
      });
      if (structuredCompanyName) {
        console.log(`📋 JSON-LD found: company="${structuredCompanyName}", role="${structuredRoleTitle}"`);
      }
    } catch (e) {
      // JSON-LD extraction failed, no problem
    }

    // Remove script and style elements
    $('script, style').remove();
    
    // Try to find common job description containers
    let jobDescription = '';
    
    // Common selectors for job description sections
    const selectors = [
      '[class*="job-description"]',
      '[class*="description"]',
      '[id*="job-description"]',
      '[id*="description"]',
      'main',
      'article',
      '.content',
      '#content'
    ];
    
    for (const selector of selectors) {
      const content = $(selector).text();
      if (content.length > 500) {
        jobDescription = content;
        break;
      }
    }
    
    // Fallback to body if no specific section found
    if (!jobDescription || jobDescription.length < 500) {
      jobDescription = $('body').text();
    }
    
    // Clean up the text
    jobDescription = jobDescription
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
    
    console.log('Final logo result:', logo ? `✅ Found: ${logo}` : '❌ No logo found');

    // Compare with Jina result — prefer Jina if cheerio got an empty SPA shell
    const jinaText = await jinaPromise;
    if (jinaText && jinaText.length > jobDescription.length * 1.5) {
      console.log(`Jina text (${jinaText.length} chars) substantially longer than cheerio (${jobDescription.length} chars) — using Jina`);
      jobDescription = jinaText;
    }

    return { jobDescription, logo, companyWebsite, linkedinCompanyUrl, structuredCompanyName, structuredRoleTitle, structuredCompanyUrl };
  } catch (error) {
    console.error('Error scraping URL:', error.message);
    throw new Error(`Failed to scrape URL: ${error.message}`);
  }
}

// Function to extract company information using OpenAI
async function extractCompanyInfo(jobDescription, companyName, url) {
  if (!companyName) return null;
  
  // Check database first
  try {
    const cached = await getCompanyFullData(companyName);
    if (cached && (cached.fundingRounds?.length > 0 || cached.founded || cached.description)) {
      console.log(`📦 Using database company info for: ${companyName}`);
      return {
        name: cached.name,
        founded: cached.founded,
        description: cached.description,
        founders: cached.founders || [],
        fundingRounds: cached.fundingRounds || [],
        logoUrl: cached.logo_url
      };
    }
  } catch (dbError) {
    console.log('Database lookup failed, falling back to OpenAI:', dbError.message);
  }
  
  try {
    const openai = getOpenAIClient();
    const prompt = `You are a business intelligence expert with access to up-to-date company information. Please provide detailed information about the company: ${companyName}

Please provide the following information about ${companyName}:

1. **Company Name**: The exact, official company name
2. **Year Founded**: The year the company was founded
3. **Company Description**: A brief 2-3 sentence description of what the company does, its mission, and main products/services
4. **Founder Information**: 
   - Founder name(s)
   - Founder LinkedIn profile URL(s) if known
   - Brief background about the founder(s)
5. **Funding Rounds**: Provide a comprehensive list of all known funding rounds including:
   - Date (year and month if available)
   - Round type (Seed, Series A, Series B, etc.)
   - Amount raised
   - Lead investors (if known)
   - Purpose or description of the round
6. **Logo URL**: If you know a common logo URL pattern or can suggest where to find it (e.g., company website)

Use your knowledge base to provide accurate, up-to-date information about this company. If you're not certain about specific details, you can indicate that, but try to provide as much information as possible.

Format your response as JSON with the following structure:
{
  "name": "Exact Company Name",
  "founded": "YYYY",
  "description": "2-3 sentence company description",
  "founders": [
    {
      "name": "Founder Name",
      "linkedin": "https://linkedin.com/in/username or null",
      "background": "Brief background about the founder"
    }
  ],
  "fundingRounds": [
    {
      "year": "YYYY",
      "month": "Month name or null",
      "type": "Seed / Series A / Series B / etc",
      "amount": "$X million / $X billion or null",
      "leadInvestors": ["Investor 1", "Investor 2"] or null,
      "description": "Purpose or description of the funding round"
    }
  ],
  "logoUrl": "https://companydomain.com/logo.png or null"
}

If you cannot find information about the company, return null for fields you don't know, but still try to provide the company name and any available information.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are a business intelligence expert with comprehensive knowledge of companies, their funding history, founding dates, and business descriptions. Provide accurate, detailed information based on your knowledge base. For funding rounds, include dates, amounts, round types, and lead investors when available."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const responseText = completion.choices[0].message.content;
    console.log('OpenAI company info response (first 500 chars):', responseText.substring(0, 500));
    
    // Check if OpenAI is asking for clarification or doesn't recognize the company
    if (responseText.toLowerCase().includes("don't know") || 
        responseText.toLowerCase().includes("cannot find") ||
        responseText.toLowerCase().includes("ambiguous") ||
        responseText.toLowerCase().includes("need the exact") ||
        responseText.toLowerCase().includes("please provide")) {
      console.log('OpenAI could not identify the company, using fallback');
      return null; // Return null so we use the fallback
    }
    
    // Try to parse JSON from the response
    let companyInfo;
    try {
      // Try to extract JSON from markdown code blocks first
      let jsonText = responseText;
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      } else {
        // Try to find JSON object in the text
        const jsonObjectMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonText = jsonObjectMatch[0];
        }
      }
      
      companyInfo = JSON.parse(jsonText);
      
      // Ensure required fields exist
      if (!companyInfo.name) {
        companyInfo.name = companyName;
      }
      
      // Ensure fundingRounds is an array
      if (!Array.isArray(companyInfo.fundingRounds)) {
        companyInfo.fundingRounds = companyInfo.fundingRounds ? [companyInfo.fundingRounds] : [];
      }
      
      // Ensure founders is an array
      if (!Array.isArray(companyInfo.founders)) {
        companyInfo.founders = companyInfo.founders ? [companyInfo.founders] : [];
      }
      
      // Sort funding rounds by year (most recent first)
      if (companyInfo.fundingRounds.length > 0) {
        companyInfo.fundingRounds.sort((a, b) => {
          const yearA = parseInt(a.year) || 0;
          const yearB = parseInt(b.year) || 0;
          if (yearB !== yearA) return yearB - yearA;
          // If same year, try to sort by month
          const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const monthA = a.month && months.indexOf(a.month) >= 0 ? months.indexOf(a.month) : 0;
          const monthB = b.month && months.indexOf(b.month) >= 0 ? months.indexOf(b.month) : 0;
          return monthB - monthA;
        });
      }
      
      
      console.log('Parsed company info:', {
        name: companyInfo.name,
        founded: companyInfo.founded,
        fundingRounds: companyInfo.fundingRounds.length
      });
      
      // Save to database for future use
      try {
        await saveCompanyInfo({
          ...companyInfo,
          companyWebsite: url,
          linkedinCompanyUrl: null
        });
        console.log(`✅ Saved company info to database: ${companyInfo.name}`);
      } catch (saveError) {
        console.log('Failed to save company info to database (non-critical):', saveError.message);
      }
      
      return companyInfo;
    } catch (parseError) {
      console.error('Error parsing company info from OpenAI:', parseError.message);
      console.error('Response text (first 1000 chars):', responseText.substring(0, 1000));
      // Return null so we use the fallback instead
      return null;
    }
  } catch (error) {
    console.error('Error extracting company info with OpenAI:', error.message);
    return null;
  }
}

// Function to generate study plan and questions using OpenAI
async function generateStudyPlan(jobDescription, companyName = 'the company', roleTitle = null, userId = null) {
  try {
    // Check database cache first (exact hash match)
    const jobHash = hashJobDescription(jobDescription);
    try {
      const cached = await getCachedStudyPlan(jobHash);
      if (cached) {
        console.log(`📦 Using cached study plan (hash: ${jobHash.substring(0, 8)}...)`);
        return cached;
      }
    } catch (dbError) {
      console.log('Database lookup failed, generating new study plan:', dbError.message);
    }

    // Fallback: check if another user analyzed the same company+role
    try {
      const match = await findStudyPlanByCompanyRole(companyName, roleTitle);
      if (match) {
        console.log(`🔄 Reusing study plan from company+role match: ${companyName} / ${roleTitle} (source hash: ${match.sourceHash.substring(0, 8)}...)`);
        // Save under this hash too so future lookups are instant
        await saveStudyPlan(jobHash, match.studyPlan, companyName, roleTitle);
        return match.studyPlan;
      }
    } catch (matchError) {
      console.log('Company+role lookup failed (non-critical):', matchError.message);
    }

    // Query user's existing topics for prompt injection
    let existingTopicsPrompt = '';
    if (userId) {
      try {
        const userTopics = await getAllUserTopics(userId);
        if (userTopics.length > 0) {
          const topicNames = [...new Set(userTopics.map(t => t.topic_name))];
          existingTopicsPrompt = `\nEXISTING USER TOPICS — REUSE WHEN RELEVANT:
The user already has these study topics from previous job analyses. When a topic below matches what you would create, use the EXACT name from this list instead of inventing a new one. Only create a new topic name if none of these cover the concept.
${topicNames.map(n => `- "${n}"`).join('\n')}
`;
        }
      } catch (topicErr) {
        console.log('Non-critical: failed to fetch user topics for prompt:', topicErr.message);
      }
    }

    const openai = getOpenAIClient();

    // Extract key information from job description to create field-specific prompts
    const jobDescriptionLower = jobDescription.toLowerCase();
    let fieldContext = '';
    let questionFocus = '';
    
    // Detect field/domain
    if (jobDescriptionLower.includes('frontend') || jobDescriptionLower.includes('react') || jobDescriptionLower.includes('vue') || jobDescriptionLower.includes('angular')) {
      fieldContext = 'frontend development';
      questionFocus = 'Focus on modern frameworks, state management, performance optimization, accessibility, and user experience. Include questions about component architecture, hooks, lifecycle, and real-world problem-solving scenarios.';
    } else if (jobDescriptionLower.includes('backend') || jobDescriptionLower.includes('api') || jobDescriptionLower.includes('server')) {
      fieldContext = 'backend development';
      questionFocus = 'Focus on system design, database optimization, API design, scalability, security, and distributed systems. Include questions about architecture patterns, caching strategies, and handling high traffic.';
    } else if (jobDescriptionLower.includes('full stack') || jobDescriptionLower.includes('fullstack')) {
      fieldContext = 'full-stack development';
      questionFocus = 'Focus on end-to-end system understanding, database design, API integration, authentication/authorization, and deployment. Include questions that test both frontend and backend knowledge.';
    } else if (jobDescriptionLower.includes('data') || jobDescriptionLower.includes('analyst') || jobDescriptionLower.includes('sql')) {
      fieldContext = 'data engineering/analysis';
      questionFocus = 'Focus on data modeling, SQL optimization, ETL processes, data pipelines, and analytics. Include questions about query performance, data warehousing, and statistical analysis.';
    } else if (jobDescriptionLower.includes('devops') || jobDescriptionLower.includes('sre') || jobDescriptionLower.includes('infrastructure')) {
      fieldContext = 'DevOps/Infrastructure';
      questionFocus = 'Focus on CI/CD, containerization, cloud services, monitoring, and infrastructure as code. Include questions about deployment strategies, scaling, and system reliability.';
    } else if (jobDescriptionLower.includes('machine learning') || jobDescriptionLower.includes('ml') || jobDescriptionLower.includes('ai')) {
      fieldContext = 'machine learning/AI';
      questionFocus = 'Focus on model selection, training, evaluation metrics, feature engineering, and production ML systems. Include questions about algorithms, overfitting, and real-world ML challenges.';
    } else {
      fieldContext = 'the specific role';
      questionFocus = 'Analyze the job description carefully and create questions that test the exact skills, technologies, and responsibilities mentioned. Make questions practical and relevant to the day-to-day work.';
    }
    
    // Extract tech stack from job description
    const techStackMatch = jobDescription.match(/(?:tech stack|technologies|stack|tools|skills|requirements|technologies used|tech|framework|language)[\s\S]{0,800}/i);
    let techStack = techStackMatch ? techStackMatch[0] : '';
    // Also try to extract common tech terms
    const commonTech = ['React', 'Vue', 'Angular', 'Node.js', 'Python', 'Java', 'TypeScript', 'JavaScript', 'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'MongoDB', 'Redis', 'GraphQL', 'REST', 'Microservices'];
    const foundTech = commonTech.filter(tech => jobDescription.includes(tech));
    if (foundTech.length > 0 && !techStack) {
      techStack = foundTech.join(', ');
    }
    
    const MAX_JD_FOR_PROMPT = 15_000;
    const truncatedJD = jobDescription.length > MAX_JD_FOR_PROMPT ? jobDescription.substring(0, MAX_JD_FOR_PROMPT) : jobDescription;

    // Parse seniority and build difficulty guidance
    const seniority = parseSeniority(roleTitle, jobDescription);
    let seniorityGuidance = '';
    switch (seniority.level) {
      case 'intern':
      case 'junior':
        seniorityGuidance = `This is a ${seniority.label} position${seniority.yearsHint ? ` (${seniority.yearsHint}+ years experience)` : ''}. Focus on fundamentals, practical coding patterns, and clear step-by-step explanations. Ask about basic implementations, common patterns, and foundational concepts. Avoid advanced architecture or leadership questions.`;
        break;
      case 'mid':
        seniorityGuidance = `This is a ${seniority.label} position${seniority.yearsHint ? ` (${seniority.yearsHint}+ years experience)` : ''}. Balance fundamentals with intermediate concepts. Include practical problem-solving, design discussions, and collaboration scenarios.`;
        break;
      case 'senior':
        seniorityGuidance = `This is a ${seniority.label} position${seniority.yearsHint ? ` (${seniority.yearsHint}+ years experience)` : ''}. Focus on deep technical discussions, design patterns, performance optimization, trade-off analysis, and technical leadership. Avoid basic syntax or introductory-level questions.`;
        break;
      case 'staff':
      case 'lead':
        seniorityGuidance = `This is a ${seniority.label} position${seniority.yearsHint ? ` (${seniority.yearsHint}+ years experience)` : ''}. Focus on system design trade-offs, architecture decisions, cross-team technical leadership, mentoring, and strategic thinking. Questions should test depth of understanding, not breadth of syntax. Avoid basic or introductory questions entirely.`;
        break;
    }

    const prompt = `You are an expert career coach and technical interviewer specializing in ${fieldContext}. Based on the following job description for ${companyName}, create a comprehensive study plan and a LARGE set of interview questions.

${seniorityGuidance}

IMPORTANT: Generate questions that are SPECIFIC to ${companyName} and their tech stack. Include:
1. Company-specific culture and values questions about ${companyName}
2. Technical questions about their specific tech stack: ${techStack || 'extract from job description'}
3. Role-specific questions for this position
4. Behavioral questions relevant to ${companyName}'s work style and industry
5. Questions that test knowledge of ${techStack ? techStack.split(',').slice(0, 5).join(', ') : 'the technologies mentioned in the job description'}

Job Description:
${truncatedJD}

${questionFocus}

Please provide:
1. A structured study plan organized by topics/skills mentioned in the job description
2. **At least 20-30 interview questions** organized by interview stage, with **5-8 questions per stage across 3-5 stages**
3. For each topic, include up-to-date information and best practices (as of 2025)
4. Make the study plan actionable with specific areas to focus on
5. For interview questions, provide detailed answers with explanations and examples
6. Include REAL, WORKING URLs to high-quality learning resources
7. Answers should be comprehensive enough to help someone actually prepare
8. Questions should be realistic and similar to what they would actually face
9. Think deeply about what makes a good candidate for THIS role
10. Include both technical depth questions and practical problem-solving scenarios

CRITICAL — CATEGORY RULES:
- Use SPECIFIC, DESCRIPTIVE categories based on the actual job description technologies and skills
- NEVER use generic categories like just "Technical" or "Behavioral"
- Good categories: "React & Frontend", "Node.js & APIs", "System Design", "Databases & SQL", "TypeScript & Type Safety", "Testing & QA", "Leadership & Collaboration", "${companyName} Culture", "Problem Solving & Algorithms", "DevOps & Deployment", "Architecture Patterns", "Communication & Teamwork"
- Each question MUST have a specific category — aim for 5-8 distinct categories across all questions
- Categories should reflect the actual technologies and skills in the job description

CRITICAL — TOPIC NAMING RULES:
- Use SHORT, GENERIC topic names reusable across companies (1-4 words max)
- GOOD: "React & Frontend", "System Design", "SQL & Databases", "Python"
- BAD: "Python & SQL Proficiency", "Advanced React Skills", "Qonto Culture and Values"
- Do NOT include the company name in topic names
- Do NOT add suffixes like "proficiency", "skills", "expertise", "fundamentals"
- Do NOT create company culture/values as a study plan topic — culture questions belong in interviewQuestions only
${existingTopicsPrompt}
Format your response as JSON with the following structure:
{
  "studyPlan": {
    "topics": [
      {
        "topic": "Topic name",
        "description": "Why this is important",
        "studyResources": [
          {
            "title": "Resource title",
            "url": "https://actual-working-url.com",
            "type": "Documentation|Tutorial|Course|Article"
          }
        ],
        "keyPoints": ["Point 1", "Point 2"]
      }
    ]
  },
  "interviewQuestions": {
    "stages": [
      {
        "stageName": "Stage name (e.g., Technical Deep Dive, System Design, Behavioral)",
        "questions": [
          {
            "question": "Question text",
            "category": "Specific category (e.g., 'React & Frontend', NOT just 'Technical')",
            "answer": "Comprehensive answer with examples and context",
            "references": [
              {
                "title": "Reference title",
                "url": "https://actual-working-url.com",
                "description": "Why this reference is useful"
              }
            ],
            "tips": "Additional tips for answering this question"
          }
        ]
      }
    ]
  },
  "summary": "Brief summary of key focus areas"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Much cheaper than gpt-4-turbo-preview (~95% cost reduction)
      messages: [
        {
          role: "system",
          content: "You are an expert career coach specializing in technical interviews and job preparation. Provide detailed, actionable study plans and realistic interview questions."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 6000, // Increased to allow for 20-30 questions with detailed answers
    });

    const responseText = completion.choices[0].message.content;
    
    // Try to parse JSON from the response
    let parsedResponse;
    try {
      // Extract JSON if it's wrapped in markdown code blocks
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : responseText;
      parsedResponse = JSON.parse(jsonText);
    } catch (parseError) {
      // If JSON parsing fails, return the raw text
      parsedResponse = {
        rawResponse: responseText,
        error: "Failed to parse structured response"
      };
    }

    // Save to database for future use
    try {
      await saveStudyPlan(jobHash, parsedResponse, companyName, roleTitle);
    } catch (saveError) {
      console.log('Failed to save study plan to database (non-critical):', saveError.message);
    }
    
    return parsedResponse;
  } catch (error) {
    console.error('Error generating study plan:', error.message);
    throw new Error(`Failed to generate study plan: ${error.message}`);
  }
}

// API endpoint to process job description URL
app.post('/api/analyze', requireAuth, async (req, res) => {
  // User is authenticated (required by requireAuth middleware)
  const user = req.user;

  // Rate limit: 5 analyses per 10 minutes
  const rl = rateLimit(user.id, 'analyze', 5, 10 * 60 * 1000);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many analyses. Please wait before trying again.', retryAfter: rl.retryAfter });
  }

  const { url, text: pastedText, companyName: providedCompanyName, roleTitle: providedRoleTitle } = req.body;
  if (!url && !pastedText) {
    return res.status(400).json({ error: 'URL or pasted job description is required' });
  }

  // Reject known multi-job/search/feed URLs before any scraping
  if (url) {
    const multiJobPatterns = [
      /linkedin\.com\/jobs\/(collections|search)/i,
      /indeed\.com\/jobs\?/i,
      /glassdoor\.com\/Job\/jobs/i,
      /ziprecruiter\.com\/jobs\/search/i,
      /monster\.com\/jobs\/search/i,
    ];
    if (multiJobPatterns.some(p => p.test(url))) {
      return res.status(400).json({
        error: 'This looks like a job search/feed page with multiple listings. Please link to a specific job posting, or paste the job description instead.'
      });
    }
  }

  // Job analysis check BEFORE SSE starts (so we can return JSON 402)
  const analysisCheck = await checkJobAnalyses(user.id);
  if (!analysisCheck.hasAnalyses) {
    return res.status(402).json({
      error: 'No job analyses remaining',
      resourceType: 'jobAnalyses',
      remaining: analysisCheck.remaining,
      upgradeRequired: true
    });
  }

  // --- SSE setup ---
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const sendStep = (step, label) => {
    res.write(`data: ${JSON.stringify({ type: 'step', step, label })}\n\n`);
  };
  const sendResult = (data) => {
    res.write(`data: ${JSON.stringify({ type: 'result', data })}\n\n`);
    res.end();
  };
  const sendError = (message) => {
    res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
    res.end();
  };

  let clientDisconnected = false;
  req.on('close', () => { clientDisconnected = true; });

  try {
    // Step 0: Fetching job posting
    sendStep(0, 'Fetching job posting');

    let jobDescription, jobLogo = null, companyWebsite = null, linkedinCompanyUrl = null;
    let structuredCompanyName = null, structuredRoleTitle = null, structuredCompanyUrl = null;
    let cachedUrlData = null, cachedLogo = null, cachedRoleTitle = null, cachedCompanyName = null;
    let shouldRefetchLogo = false;

    if (pastedText) {
      // User pasted text directly — skip scraping
      const MAX_JD_LENGTH = 30_000;
      jobDescription = pastedText.trim();
      if (jobDescription.length < 100) {
        return sendError('The pasted text is too short. Please paste the full job description.');
      }
      if (jobDescription.length > MAX_JD_LENGTH) {
        jobDescription = jobDescription.substring(0, MAX_JD_LENGTH);
      }
    } else {
      // Check cache first for logo, role title, and company name
      cachedUrlData = await getCachedJobUrl(url);
      cachedLogo = cachedUrlData?.logo_url;
      cachedRoleTitle = cachedUrlData?.role_title;
      cachedCompanyName = cachedUrlData?.company_name;

      // If we have cached data but no logo, try to fetch logo again
      if (cachedUrlData && !cachedLogo) {
        console.log('📋 JD already parsed but logo missing - will attempt to fetch logo');
        shouldRefetchLogo = true;
      }

      // Scrape the job description
      const scrapeResult = await scrapeJobDescription(url);
      jobDescription = scrapeResult.jobDescription;
      jobLogo = scrapeResult.logo;
      companyWebsite = scrapeResult.companyWebsite;
      linkedinCompanyUrl = scrapeResult.linkedinCompanyUrl;
      structuredCompanyName = scrapeResult.structuredCompanyName;
      structuredRoleTitle = scrapeResult.structuredRoleTitle;
      structuredCompanyUrl = scrapeResult.structuredCompanyUrl;

      if (!jobDescription || jobDescription.length < 100) {
        return sendError('Could not extract meaningful content from the URL. Try pasting the job description instead.');
      }
    }

    // Known single-job URL patterns — skip LLM validation for these
    const singleJobPatterns = [
      /linkedin\.com\/jobs\/view\/\d+/i,
      /boards\.greenhouse\.io\/[\w-]+\/jobs\/\d+/i,
      /jobs\.greenhouse\.io\/[\w-]+\/jobs\/\d+/i,
      /jobs\.lever\.co\/[\w-]+\/[\w-]+/i,
      /\.myworkdayjobs\.com\/.+\/job\//i,
      /jobs\.ashbyhq\.com\/[\w-]+\/[\w-]+/i,
      /indeed\.com\/viewjob/i,
      /glassdoor\.com\/job-listing\//i,
      /careers\.[\w-]+\.com\/.*job/i,
    ];
    const skipValidation = url && singleJobPatterns.some(p => p.test(url));

    // Step 1: Validating job content
    sendStep(1, 'Validating job content');
    if (skipValidation) {
      console.log(`✅ URL matches known single-job pattern — skipping LLM validation: ${url}`);
    } else {
      const validation = await validateJobContent(jobDescription);
      if (!validation.isJobPosting && validation.confidence === 'high' &&
          (validation.contentType === 'multiple_jobs' || validation.contentType === 'error_page')) {
        const errorMessages = {
          multiple_jobs: 'This URL contains multiple job listings. Please link to a specific job posting, or paste the job description instead.',
          error_page: "The page couldn't load properly. Try pasting the job description instead.",
        };
        return sendError(errorMessages[validation.contentType]);
      }
      if (!validation.isJobPosting) {
        console.log(`⚠️ Content validation uncertain (${validation.confidence} ${validation.contentType}): ${validation.reason} — proceeding anyway`);
      }
    }

    // Step 2: Parsing description
    sendStep(2, 'Parsing description content');

    // Use cached logo if available, otherwise use scraped logo
    let finalLogo = cachedLogo || jobLogo;
    
    // Try logo.dev if we have company website but no logo yet (or even if we have logo, logo.dev might be better quality)
    if (companyWebsite) {
      try {
        const domain = new URL(companyWebsite).hostname.replace('www.', '');
        const logoApiUrl = `https://logo.dev/${domain}`;
        console.log(`🔄 Trying logo.dev for ${domain}: ${logoApiUrl}`);
        
        // Try GET to verify it's an image
        try {
          const agent = await getHttpsAgent();
          const logoResponse = await axios.get(logoApiUrl, { 
            timeout: 5000, 
            validateStatus: (status) => status < 500,
            responseType: 'arraybuffer',
            maxContentLength: 5000000,
            httpsAgent: agent
          });
          
          if (logoResponse.status === 200 && logoResponse.data && logoResponse.data.length > 0) {
            const contentType = logoResponse.headers['content-type'] || '';
            if (contentType.startsWith('image/')) {
              finalLogo = logoApiUrl;
              console.log(`✅ Found logo from logo.dev for ${domain}:`, finalLogo);
            } else {
              console.log(`logo.dev returned non-image content-type: ${contentType} for ${domain}`);
            }
          }
        } catch (getError) {
          // Try HEAD as fallback
          try {
            const agent = await getHttpsAgent();
            const logoCheck = await axios.head(logoApiUrl, { 
              timeout: 3000, 
              validateStatus: (status) => status < 500,
              httpsAgent: agent
            });
            if (logoCheck.status === 200) {
              const contentType = logoCheck.headers['content-type'] || '';
              if (contentType.startsWith('image/')) {
                finalLogo = logoApiUrl;
                console.log(`✅ Found logo from logo.dev (HEAD) for ${domain}:`, finalLogo);
              }
            }
          } catch (headError) {
            console.log(`❌ logo.dev not available for ${domain}:`, headError.message);
          }
        }
      } catch (e) {
        console.log('logo.dev error:', e.message);
      }
    }
    
    // Also try logo.dev with company name if we don't have website but have company name
    if (!finalLogo && cachedCompanyName && !companyWebsite) {
      try {
        // Try to construct domain from company name (e.g., "Keyrock" -> "keyrock.com")
        const cleanName = cachedCompanyName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const possibleDomains = [
          `${cleanName}.com`,
          `${cleanName}.io`,
          `${cleanName}.co`
        ];
        
        for (const domain of possibleDomains) {
          try {
            const logoApiUrl = `https://logo.dev/${domain}`;
            const agent = await getHttpsAgent();
            const logoResponse = await axios.get(logoApiUrl, { 
              timeout: 3000, 
              validateStatus: (status) => status < 500,
              responseType: 'arraybuffer',
              maxContentLength: 5000000,
              httpsAgent: agent
            });
            
            if (logoResponse.status === 200 && logoResponse.data && logoResponse.data.length > 0) {
              const contentType = logoResponse.headers['content-type'] || '';
              if (contentType.startsWith('image/')) {
                finalLogo = logoApiUrl;
                console.log(`✅ Found logo from logo.dev for ${domain} (from company name):`, finalLogo);
                break;
              }
            }
          } catch (e) {
            // Try next domain
            continue;
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    // Try fetching from company website directly if logo.dev didn't work
    if (!finalLogo && companyWebsite) {
      try {
        console.log('Fetching logo from company website:', companyWebsite);
        const websiteResponse = await axios.get(companyWebsite, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 5000,
          maxRedirects: 3
        });
        
        const $website = cheerio.load(websiteResponse.data);
        const websiteLogoSelectors = [
          'meta[property="og:image"]',
          'meta[name="twitter:image"]',
          'img[alt*="logo" i]',
          'img[class*="logo" i]',
          '.logo img',
          '[class*="logo"] img',
          'header img',
        ];
        
        for (const selector of websiteLogoSelectors) {
          const element = $website(selector).first();
          if (element.length) {
            let websiteLogo = element.attr('src') || 
                             element.attr('content') ||
                             element.attr('data-src');
            
            if (websiteLogo) {
              if (!websiteLogo.startsWith('http')) {
                websiteLogo = new URL(websiteLogo, companyWebsite).href;
              }
              // Filter out favicons
              const lowerLogo = websiteLogo.toLowerCase();
              if (!lowerLogo.includes('favicon') && 
                  !lowerLogo.includes('icon') &&
                  (websiteLogo.match(/\.(jpg|jpeg|png|gif|svg|webp)/i) || 
                   lowerLogo.includes('logo'))) {
                finalLogo = websiteLogo;
                console.log('✅ Found logo from company website:', finalLogo);
                break;
              }
            }
          }
        }
      } catch (e) {
        console.log('Could not fetch logo from company website:', e.message);
      }
    }
    
    // If we found a logo, update the cache
    if (finalLogo && shouldRefetchLogo) {
      console.log('💾 Updating cache with newly found logo');
      await saveJobUrlCache(url, finalLogo, cachedRoleTitle, cachedCompanyName);
    }

    // Step 3: Identifying company & role
    sendStep(3, 'Identifying company & role');

    // --- Priority cascade for company name and role title ---
    // Tier 1: Cache
    let companyName = providedCompanyName || cachedCompanyName || null;
    let roleTitle = providedRoleTitle || cachedRoleTitle || null;

    // Tier 2: JSON-LD structured data
    if (!companyName && structuredCompanyName) {
      const validated = validateCompanyName(structuredCompanyName);
      if (validated) {
        companyName = validated;
        console.log('✅ Company name from JSON-LD:', companyName);
      }
    }
    if (!roleTitle && structuredRoleTitle) {
      roleTitle = structuredRoleTitle.trim();
      console.log('✅ Role title from JSON-LD:', roleTitle);
    }
    // Use structured company URL if we don't have one yet
    if (!companyWebsite && structuredCompanyUrl) {
      companyWebsite = structuredCompanyUrl;
      console.log('✅ Company website from JSON-LD:', companyWebsite);
    }

    // Tier 3: Combined LLM call on cleaned text (only if we still need company or role)
    if (!companyName || !roleTitle) {
      try {
        const openai = getOpenAIClient();
        const cleanedText = cleanJobContent(jobDescription);
        const extractionPrompt = `Extract the company name and job title from this job posting.

IMPORTANT:
- "Company name" means the company that is HIRING for this role, not a job board or platform.
- IGNORE UI elements and navigation text like "Email", "Share", "Save", "Apply", "Sign In", "LinkedIn", "Indeed", "Glassdoor".
- If unsure, return "UNKNOWN" for that field.

Job Posting:
${cleanedText.substring(0, 4000)}

Return JSON: {"companyName": "...", "roleTitle": "..."}`;

        const extraction = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You extract structured data from job postings. Return valid JSON with companyName and roleTitle fields. Ignore navigation, buttons, and UI text — focus only on the actual job posting content."
            },
            { role: "user", content: extractionPrompt }
          ],
          temperature: 0.1,
          max_tokens: 100,
          response_format: { type: "json_object" },
        });

        const parsed = JSON.parse(extraction.choices[0].message.content);
        if (!companyName && parsed.companyName) {
          const validated = validateCompanyName(parsed.companyName);
          if (validated) {
            companyName = validated;
            console.log('✅ Company name from LLM:', companyName);
          }
        }
        if (!roleTitle && parsed.roleTitle && parsed.roleTitle !== 'UNKNOWN' && parsed.roleTitle.length > 2) {
          roleTitle = parsed.roleTitle.replace(/^["']|["']$/g, '').trim();
          console.log('✅ Role title from LLM:', roleTitle);
        }
      } catch (error) {
        console.log('LLM extraction failed, using fallbacks:', error.message);
      }
    }

    // Tier 4: LinkedIn company slug fallback for company name
    if (!companyName && linkedinCompanyUrl) {
      try {
        const slug = linkedinCompanyUrl.match(/linkedin\.com\/company\/([\w-]+)/)?.[1];
        if (slug) {
          companyName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          console.log('✅ Company name from LinkedIn slug:', companyName);
        }
      } catch (e) {
        // ignore
      }
    }

    // Tier 5: Regex fallback
    if (!companyName) {
      companyName = extractCompanyName(jobDescription, url);
      console.log('Extracted company name using regex fallback:', companyName);
    }
    if (!roleTitle) {
      const rolePatterns = [
        /(?:position|role|job|hiring|seeking|looking for)[:\s]+([A-Z][a-zA-Z\s&]+(?:Engineer|Developer|Manager|Designer|Analyst|Specialist|Lead|Director|Architect))/i,
        /(?:we are|we're|are) (?:hiring|seeking|looking for) (?:a |an )?([A-Z][a-zA-Z\s&]+(?:Engineer|Developer|Manager|Designer|Analyst|Specialist|Lead|Director|Architect))/i,
        /^([A-Z][a-zA-Z\s&]+(?:Engineer|Developer|Manager|Designer|Analyst|Specialist|Lead|Director|Architect))/m
      ];
      for (const pattern of rolePatterns) {
        const match = jobDescription.match(pattern);
        if (match && match[1]) {
          roleTitle = match[1].trim();
          console.log('Extracted role title using regex fallback:', roleTitle);
          break;
        }
      }
    }

    // Now try logo.dev with extracted company name if we still don't have a logo
    if (!finalLogo && companyName && !companyWebsite) {
      try {
        const cleanName = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const possibleDomains = [
          `${cleanName}.com`,
          `${cleanName}.io`,
          `${cleanName}.co`
        ];

        console.log(`🔄 Trying logo.dev with company name "${companyName}" -> domains:`, possibleDomains);

        for (const domain of possibleDomains) {
          try {
            const logoApiUrl = `https://logo.dev/${domain}`;
            const agent = await getHttpsAgent();
            const logoResponse = await axios.get(logoApiUrl, {
              timeout: 3000,
              validateStatus: (status) => status < 500,
              responseType: 'arraybuffer',
              maxContentLength: 5000000,
              httpsAgent: agent
            });

            if (logoResponse.status === 200 && logoResponse.data && logoResponse.data.length > 0) {
              const contentType = logoResponse.headers['content-type'] || '';
              if (contentType.startsWith('image/')) {
                finalLogo = logoApiUrl;
                console.log(`✅ Found logo from logo.dev for ${domain} (from company name):`, finalLogo);
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }

    // If we found a logo, update the cache
    if (finalLogo && shouldRefetchLogo) {
      console.log('💾 Updating cache with newly found logo');
      await saveJobUrlCache(url, finalLogo, roleTitle, companyName);
    }

    // Save to cache for future requests (saves API calls)
    if (url && (companyName || roleTitle || finalLogo)) {
      await saveJobUrlCache(url, finalLogo, roleTitle, companyName);
    }

    // Start with a basic company info object - we'll enhance it
    let companyInfo = {
      name: companyName || 'Company',
      roleTitle: roleTitle || null,
      logo: finalLogo || null,
      logoUrl: finalLogo || null, // Use cached or scraped logo
      companyWebsite: companyWebsite || null,
      linkedinCompanyUrl: linkedinCompanyUrl || null,
      founded: null,
      description: null,
      founders: [],
      fundingRounds: []
    };
    
    // Priority order for logo:
    // 1. Logo from job page (already set)
    // 2. Logo from LinkedIn (already fetched in scrapeJobDescription if LinkedIn URL found)
    // 3. Logo from company website (already fetched in scrapeJobDescription if website found)
    // 4. Clearbit API using actual domain (last resort)
    
    // No Clearbit - only use logos from actual sources (job page, LinkedIn, company website)

    // Step 4: Researching company
    sendStep(4, 'Researching company background');

    // If we have a valid company name (not "us", "you", etc.), try to get more info from OpenAI
    if (companyName && companyName.length > 2 &&
        !['us', 'us.', 'you', 'your', 'we', 'our', 'company', 'unknown'].includes(companyName.toLowerCase())) {
      try {
        console.log('Calling OpenAI for company info...');
        const openaiCompanyInfo = await extractCompanyInfo(jobDescription, companyName, url);
        console.log('OpenAI returned:', openaiCompanyInfo ? 'data' : 'null');
        
        if (openaiCompanyInfo && openaiCompanyInfo.name) {
          // Merge OpenAI data with our basic info
          companyInfo = {
            ...companyInfo,
            name: openaiCompanyInfo.name || companyInfo.name,
            founded: openaiCompanyInfo.founded || companyInfo.founded,
            description: openaiCompanyInfo.description || companyInfo.description,
            founders: Array.isArray(openaiCompanyInfo.founders) 
              ? openaiCompanyInfo.founders 
              : companyInfo.founders || [],
            fundingRounds: Array.isArray(openaiCompanyInfo.fundingRounds) 
              ? openaiCompanyInfo.fundingRounds 
              : companyInfo.fundingRounds,
            logo: finalLogo || companyInfo.logo || openaiCompanyInfo.logoUrl || openaiCompanyInfo.logo || null,
            logoUrl: finalLogo || openaiCompanyInfo.logoUrl || companyInfo.logoUrl || null
          };
          console.log('Merged company info:', {
            name: companyInfo.name,
            founded: companyInfo.founded,
            fundingRounds: companyInfo.fundingRounds.length
          });
        }
      } catch (error) {
        console.log('OpenAI company info extraction failed (non-critical):', error.message);
        // Keep the basic companyInfo we already created
      }
    } else {
      // If no valid company name, try to infer from URL
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.replace('www.', '');
        const domainParts = hostname.split('.');
        const jobBoardDomains = ['linkedin', 'indeed', 'glassdoor', 'monster', 'ziprecruiter', 'jobs', 'careers'];
        const firstPart = domainParts[0]?.toLowerCase();
        
        if (domainParts.length > 0 && !jobBoardDomains.includes(firstPart)) {
          const inferredName = domainParts[0].split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' ');
          companyInfo.name = inferredName;
          console.log('Inferred company name from URL:', companyInfo.name);
        }
      } catch (e) {
        console.log('Could not infer company name from URL');
      }
    }
    
    // Final safety check - ensure companyInfo is never null or undefined
    if (!companyInfo || !companyInfo.name || companyInfo.name.length < 2) {
      companyInfo = {
        name: 'Company',
        logo: jobLogo || null,
        founded: null,
        description: null,
        fundingRounds: []
      };
    }

    // Quality gate: require BOTH a role title and a real company name
    if (!companyInfo.roleTitle || !companyInfo.name || companyInfo.name === 'Company') {
      return sendError('Could not identify a clear role and company from this content. Try pasting the full job description instead.');
    }

    console.log('Final companyInfo being sent:', {
      name: companyInfo.name,
      hasLogo: !!companyInfo.logo,
      hasFounded: !!companyInfo.founded,
      hasDescription: !!companyInfo.description,
      fundingRoundsCount: companyInfo.fundingRounds?.length || 0
    });

    // Step 5: Generating study plan
    sendStep(5, 'Generating study plan');

    // Generate study plan (credits were validated upfront)
    const companyNameForPlan = (companyInfo && companyInfo.name) ? companyInfo.name : 'the company';
    const roleTitleForPlan = companyInfo?.roleTitle || null;
    const studyPlan = await generateStudyPlan(jobDescription, companyNameForPlan, roleTitleForPlan, user.id);

    // Quality gate: ensure study plan has topics before charging
    const planTopicsCheck = studyPlan?.studyPlan?.topics || studyPlan?.topics || [];
    if (planTopicsCheck.length === 0) {
      return sendError('Could not generate a meaningful study plan from this content. No credit was deducted. Try pasting a more detailed job description.');
    }

    await deductJobAnalysis(user.id);

    // Step 6: Company research (bundled into analysis — no training credit cost)
    sendStep(6, 'Researching company intel');

    let companyResearch = null;
    const researchCompanyName = companyInfo?.name;
    if (researchCompanyName && researchCompanyName !== 'Company' && researchCompanyName.length > 2) {
      try {
        // Check DB cache first
        const cached = await getCompanyFullData(researchCompanyName);
        if (cached && cached.research) {
          companyResearch = cached.research;
          console.log(`📦 Using cached company research for: ${researchCompanyName}`);
        } else {
          // Generate fresh research via OpenAI (no credit deduction — bundled with analysis)
          const openai = getOpenAIClient();
          const currentDate = new Date();
          const currentYear = currentDate.getFullYear();
          const currentMonth = currentDate.getMonth() + 1;

          const researchPrompt = `Provide comprehensive research and insights about the company "${researchCompanyName}".

${jobDescription ? `Job Context: ${jobDescription.substring(0, 1500)}` : ''}

IMPORTANT: Current date is ${currentYear}-${String(currentMonth).padStart(2, '0')}. Only include news from the past 6 months (${currentYear} only). If there's no recent news in the past 6 months, use an empty array.

Please provide:
1. Recent news and developments (ONLY from the past 6 months)
2. Company culture and values
3. Tech stack and tools they use (if tech company)
4. Team structure and size
5. Recent achievements or milestones (from past 6 months only)
6. What makes them unique
7. Interview tips specific to this company
8. What they value in candidates
9. Recent funding rounds (if any from past 6 months)

Format as JSON:
{
  "recentNews": ["News item 1", "News item 2"],
  "culture": "Description of company culture",
  "techStack": ["Technology 1", "Technology 2"],
  "teamSize": "Approximate team size",
  "achievements": ["Achievement 1", "Achievement 2"],
  "uniqueAspects": ["What makes them unique"],
  "interviewTips": ["Tip 1", "Tip 2"],
  "values": ["Value 1", "Value 2"],
  "recentFundingRounds": [
    {
      "year": ${currentYear},
      "month": "January",
      "type": "Series D",
      "amount": "$150M",
      "leadInvestors": ["Investor Name"],
      "description": "Funding round description"
    }
  ]
}`;

          const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
              { role: "system", content: "You are a company research expert. Provide accurate, up-to-date information about companies." },
              { role: "user", content: researchPrompt }
            ],
            temperature: 0.7,
            max_tokens: 2000,
          });

          const researchText = completion.choices[0].message.content.trim();
          try {
            const jsonMatch = researchText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              companyResearch = JSON.parse(jsonMatch[0]);
            }
          } catch (parseError) {
            console.log('Failed to parse company research JSON:', parseError.message);
          }

          // Cache for future use
          if (companyResearch) {
            try {
              await saveCompanyResearch(researchCompanyName, companyResearch);
              console.log(`✅ Cached company research for: ${researchCompanyName}`);
            } catch (saveErr) {
              console.log('Failed to cache company research (non-critical):', saveErr.message);
            }
          }
        }
      } catch (researchErr) {
        console.log('Company research failed (non-critical):', researchErr.message);
      }
    }

    // Step 7: Finalising
    sendStep(7, 'Finalising your prep guide');

    // Track this job analysis
    const jobDescriptionHash = hashJobDescription(jobDescription);
    const analysisDbId = await trackJobAnalysis(
      user.id,
      url || 'pasted-text',
      jobDescriptionHash,
      companyInfo.name,
      companyInfo.roleTitle
    );

    // Index topics from the study plan for cross-job linking
    try {
      const planTopics = studyPlan?.studyPlan?.topics || studyPlan?.topics || [];
      if (planTopics.length > 0) {
        const topicIds = [];
        for (const topicObj of planTopics) {
          const topicName = typeof topicObj === 'string' ? topicObj : (topicObj.topic || topicObj.name || '');
          if (!topicName) continue;
          const normalized = normalizeTopicName(topicName, companyInfo.name);

          // Layer 2: Try fuzzy match against user's existing topics first
          const similar = await findSimilarUserTopic(normalized, user.id);
          if (similar) {
            topicIds.push(similar.id);
            continue;
          }

          // No match — create new topic
          const description = typeof topicObj === 'object' ? topicObj.description : null;
          const category = inferTopicCategory(topicName);
          const drillable = !isCompanySpecificTopic(topicName, companyInfo.name);
          const topic = await getOrCreateTopic(topicName, category, description, { companyName: companyInfo.name, isDrillable: drillable });
          topicIds.push(topic.id);
        }
        if (topicIds.length > 0) {
          await linkTopicsToJob(jobDescriptionHash, topicIds);
          console.log(`✅ Indexed ${topicIds.length} topics for job ${jobDescriptionHash.substring(0, 8)}...`);
        }
      }
    } catch (topicErr) {
      console.error('Non-critical: topic indexing failed:', topicErr.message);
    }

    // Refresh user to get updated credits after deduction
    const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.session_token;
    const updatedUser = await getUserFromSession(sessionToken);
    console.log('Post-deduction user:', {
      jobAnalysesRemaining: updatedUser?.jobAnalysesRemaining,
      trainingCreditsRemaining: updatedUser?.trainingCreditsRemaining,
      sessionTokenSource: req.headers.authorization ? 'header' : 'cookie'
    });

    // Log what we're sending
    console.log('=== SENDING RESPONSE ===');
    console.log('companyInfo exists:', !!companyInfo);
    console.log('companyInfo.name:', companyInfo?.name);
    console.log('companyInfo.fundingRounds:', companyInfo?.fundingRounds?.length || 0);
    console.log('Full companyInfo:', JSON.stringify(companyInfo, null, 2));

    // Include seniority in the response for frontend use
    const seniorityData = parseSeniority(companyInfo?.roleTitle, jobDescription);

    const response = {
      success: true,
      id: analysisDbId, // DB id for reliable navigation
      jobDescription: jobDescription,
      jobDescriptionHash: jobDescriptionHash, // Add hash for generate more questions feature
      companyInfo: companyInfo,
      companyResearch: companyResearch || null,
      seniority: seniorityData,
      studyPlan,
      url: url || null, // Include URL for reference
      user: {
        creditsRemaining: updatedUser?.creditsRemaining || user.creditsRemaining,
        jobAnalysesRemaining: updatedUser?.jobAnalysesRemaining ?? user.jobAnalysesRemaining,
        trainingCreditsRemaining: updatedUser?.trainingCreditsRemaining ?? user.trainingCreditsRemaining,
        plan: updatedUser?.plan || user.plan,
        creditsResetAt: updatedUser?.creditsResetAt || user.creditsResetAt || null
      }
    };
    
    console.log('Response keys:', Object.keys(response));
    console.log('Response has companyInfo:', 'companyInfo' in response);

    sendResult(response);
  } catch (error) {
    console.error('Error in /api/analyze:', error);
    if (res.headersSent) {
      sendError(error.message || 'Internal server error');
    } else {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
});

// API endpoint to evaluate quiz answers
app.post('/api/quiz/evaluate', requireAuth, requireTrainingCredits('quizEvaluation'), async (req, res) => {
  try {
    const { question, userAnswer, correctAnswer, jobDescription } = req.body;

    if (!question || !userAnswer) {
      return res.status(400).json({ error: 'Question and user answer are required' });
    }

    // Deduct training credits before processing
    await deductTrainingCredits(req.user.id, TRAINING_CREDIT_COSTS.quizEvaluation);

    const openai = getOpenAIClient();
    const prompt = `You are an expert interviewer evaluating a candidate's answer to an interview question.

Question: ${question}
${correctAnswer ? `Expected Answer (for reference): ${correctAnswer}` : ''}
${jobDescription ? `Job Context: ${jobDescription.substring(0, 1000)}` : ''}

Candidate's Answer:
${userAnswer}

Please evaluate this answer and provide:
1. A score from 0-100
2. What the candidate did well (strengths)
3. What could be improved (areas for improvement)
4. Specific tips to answer better
5. Whether the answer demonstrates the required knowledge/skills

Format your response as JSON:
{
  "score": 85,
  "strengths": ["Clear explanation", "Good examples"],
  "improvements": ["Could be more specific", "Missing key concept"],
  "tips": ["Add more concrete examples", "Explain the 'why' behind your approach"],
  "demonstratesKnowledge": true,
  "feedback": "Overall good answer but could be more detailed..."
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are a helpful and constructive interviewer. Provide honest but encouraging feedback."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const responseText = completion.choices[0].message.content.trim();
    let evaluation;
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluation = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      // Fallback: create a basic evaluation
      evaluation = {
        score: 70,
        strengths: ['Attempted to answer the question'],
        improvements: ['Could provide more detail'],
        tips: ['Be more specific with examples'],
        demonstratesKnowledge: true,
        feedback: responseText || 'Answer received. Consider adding more detail and examples.'
      };
    }

    // Persist attempt
    try {
      await recordAttempt(req.user.id, {
        jobDescriptionHash: req.body.jobDescriptionHash || '',
        sessionId: req.body.sessionId || null,
        questionText: question,
        questionCategory: req.body.questionCategory || null,
        attemptType: 'quiz',
        userAnswer: userAnswer,
        score: evaluation.score || 0,
        evaluation: evaluation,
      });
    } catch (attemptError) {
      console.error('Error recording attempt (non-critical):', attemptError.message);
    }

    res.json({ success: true, evaluation });
  } catch (error) {
    console.error('Error in /api/quiz/evaluate:', error);
    res.status(500).json({ error: error.message || 'Failed to evaluate answer' });
  }
});

// API endpoint to evaluate voice recordings (transcribe and evaluate)
app.post('/api/voice/evaluate', express.json({ limit: '5mb' }), requireAuth, requireTrainingCredits('voiceEvaluation'), async (req, res) => {
  let tempFilePath = null;
  try {
    const { audioBase64, question, jobDescription } = req.body;

    if (!audioBase64 || !question) {
      return res.status(400).json({ error: 'Audio and question are required' });
    }

    // Deduct training credits before processing
    await deductTrainingCredits(req.user.id, TRAINING_CREDIT_COSTS.voiceEvaluation);

    const openai = getOpenAIClient();
    
    // Convert base64 to buffer and create a temporary file
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    tempFilePath = path.join(__dirname, `temp_audio_${Date.now()}.webm`);
    fs.writeFileSync(tempFilePath, audioBuffer);
    
    // Create a File object for OpenAI API (using fs.createReadStream)
    const audioFile = fs.createReadStream(tempFilePath);
    
    // Use Whisper API to transcribe
    // OpenAI SDK accepts a ReadStream from fs
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      language: "en",
    });

    const transcribedText = transcription.text;
    
    console.log('Transcription successful:', transcribedText.substring(0, 100) + '...');

    // Now evaluate the transcribed answer
    const evaluationPrompt = `You are an expert interviewer evaluating a candidate's spoken answer to an interview question.

Question: ${question}
${jobDescription ? `Job Context: ${jobDescription.substring(0, 1000)}` : ''}

Candidate's Spoken Answer (transcribed):
${transcribedText}

Please evaluate this answer considering:
1. Content quality and accuracy
2. Clarity and structure
3. Pacing and delivery (based on transcription patterns)
4. Whether it demonstrates required knowledge

Provide:
1. A score from 0-100
2. Content strengths
3. Content areas for improvement
4. Delivery feedback (clarity, structure, pacing)
5. Specific tips to improve both content and delivery

Format as JSON:
{
  "score": 80,
  "contentStrengths": ["Clear explanation"],
  "contentImprovements": ["Could add examples"],
  "deliveryFeedback": "Good pacing, but could be more structured",
  "tips": ["Practice structuring your answer with STAR method", "Add pauses for emphasis"],
  "transcription": "${transcribedText}",
  "feedback": "Overall good answer..."
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are a helpful interviewer providing constructive feedback on both content and delivery."
        },
        {
          role: "user",
          content: evaluationPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const responseText = completion.choices[0].message.content.trim();
    let evaluation;
    
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluation = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      evaluation = {
        score: 70,
        contentStrengths: ['Answered the question'],
        contentImprovements: ['Could be more detailed'],
        deliveryFeedback: 'Consider practicing your delivery',
        tips: ['Practice speaking clearly', 'Structure your thoughts'],
        transcription: transcribedText,
        feedback: responseText || 'Answer received'
      };
    }

    // Persist attempt
    try {
      await recordAttempt(req.user.id, {
        jobDescriptionHash: req.body.jobDescriptionHash || '',
        sessionId: req.body.sessionId || null,
        questionText: question,
        questionCategory: req.body.questionCategory || null,
        attemptType: 'voice',
        userAnswer: transcribedText,
        score: evaluation.score || 0,
        evaluation: evaluation,
      });
    } catch (attemptError) {
      console.error('Error recording voice attempt (non-critical):', attemptError.message);
    }

    res.json({
      success: true,
      transcription: transcribedText,
      evaluation,
    });

    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  } catch (error) {
    console.error('Error in /api/voice/evaluate:', error);
    console.error('Error stack:', error.stack);
    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    res.status(500).json({ 
      error: error.message || 'Failed to evaluate voice recording',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// API endpoint for chat-based practice
app.post('/api/chat/practice', requireAuth, requireTrainingCredits('chatPractice'), async (req, res) => {
  try {
    const practiceRl = rateLimit(req.user.id, 'chatPractice', 30, 10 * 60 * 1000);
    if (!practiceRl.allowed) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.', retryAfter: practiceRl.retryAfter });
    }

    const { jobDescriptionHash, topic, messages, companyName, roleTitle, sessionId } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    // Deduct training credits
    await deductTrainingCredits(req.user.id, TRAINING_CREDIT_COSTS.chatPractice);

    const openai = getOpenAIClient();

    // Get job description for context
    let jobContext = '';
    if (jobDescriptionHash) {
      try {
        const cachedPlan = await getCachedStudyPlan(jobDescriptionHash);
        if (cachedPlan?.jobDescription) {
          jobContext = cachedPlan.jobDescription.substring(0, 2000);
        }
      } catch (e) {
        // Non-critical
      }
    }

    // Build conversation history for GPT
    const systemPrompt = `You are an expert technical interviewer conducting a practice interview session.

Context:
- Company: ${companyName || 'a tech company'}
- Role: ${roleTitle || 'Software Engineer'}
- Topic: ${topic}
${jobContext ? `- Job Description (excerpt): ${jobContext.substring(0, 1000)}` : ''}

Guidelines:
- Act as a friendly but thorough interviewer
- Ask follow-up questions to probe deeper understanding
- If this is the start of the conversation (no previous messages), begin with an engaging opening question about the topic
- Keep questions relevant to the company and role context
- After the candidate answers, provide brief constructive feedback, then ask a follow-up or related question
- Be encouraging but honest about gaps in knowledge
- Vary question difficulty — start moderate, adjust based on responses
- Keep responses concise (2-4 paragraphs max)

When the candidate gives a substantive answer, include a brief evaluation in your response. Format your response as JSON:
{
  "reply": "Your conversational response here...",
  "evaluation": {
    "score": 75,
    "feedback": "Brief feedback on the answer quality"
  },
  "suggestedFollowups": ["topic 1", "topic 2"]
}

If the candidate hasn't answered a question yet (e.g., it's the opening), set evaluation to null:
{
  "reply": "Your opening question or follow-up here...",
  "evaluation": null,
  "suggestedFollowups": []
}`;

    // Convert message history to GPT format
    const gptMessages = [
      { role: 'system', content: systemPrompt }
    ];

    const recentMessages = (messages || []).slice(-20);
    if (recentMessages.length > 0) {
      recentMessages.forEach(msg => {
        const content = typeof msg.content === 'string' ? msg.content.substring(0, 3000) : '';
        if (msg.role === 'interviewer') {
          gptMessages.push({ role: 'assistant', content });
        } else if (msg.role === 'candidate') {
          gptMessages.push({ role: 'user', content });
        }
      });
    } else {
      // No messages yet — ask GPT to start the conversation
      gptMessages.push({ role: 'user', content: `Please start the interview by asking me an opening question about ${topic}.` });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: gptMessages,
      temperature: 0.8,
      max_tokens: 800,
    });

    const responseText = completion.choices[0].message.content.trim();

    // Try to parse JSON response
    let reply = responseText;
    let evaluation = null;
    let suggestedFollowups = [];

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        reply = parsed.reply || responseText;
        evaluation = parsed.evaluation || null;
        suggestedFollowups = parsed.suggestedFollowups || [];
      }
    } catch (parseError) {
      // Use raw text as reply
      reply = responseText;
    }

    // Record attempt for chat exchanges
    if (recentMessages.length > 0) {
      const lastUserMsg = recentMessages.filter(m => m.role === 'candidate').pop();
      if (lastUserMsg) {
        try {
          await recordAttempt(req.user.id, {
            jobDescriptionHash: jobDescriptionHash || '',
            sessionId: sessionId || null,
            questionText: `[Chat] ${topic}: ${lastUserMsg.content.substring(0, 100)}`,
            questionCategory: topic,
            attemptType: 'quiz',
            userAnswer: lastUserMsg.content,
            score: evaluation?.score || 50,
            evaluation: evaluation || { score: 50, feedback: 'Chat practice' },
          });
        } catch (attemptError) {
          console.error('Error recording chat attempt (non-critical):', attemptError.message);
        }
      }
    }

    res.json({
      success: true,
      reply,
      evaluation,
      suggestedFollowups,
    });
  } catch (error) {
    console.error('Error in /api/chat/practice:', error);
    res.status(500).json({ error: error.message || 'Failed to process chat message' });
  }
});

// Focus Chat — SSE streaming skill coaching
app.post('/api/chat/focus', requireAuth, async (req, res) => {
  try {
    const focusRl = rateLimit(req.user.id, 'chatFocus', 20, 10 * 60 * 1000);
    if (!focusRl.allowed) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.', retryAfter: focusRl.retryAfter });
    }

    const { skill, messages, sessionId, seniorityLevel } = req.body;

    if (!skill) {
      return res.status(400).json({ error: 'Skill is required' });
    }

    // Check and deduct training credits BEFORE starting SSE
    const user = req.user;
    const creditCheck = await checkTrainingCredits(user.id, TRAINING_CREDIT_COSTS.focusChat);
    if (!creditCheck.hasCredits) {
      return res.status(402).json({ error: 'Insufficient training credits', resourceType: 'trainingCredits', upgradeRequired: true });
    }
    await deductTrainingCredits(user.id, TRAINING_CREDIT_COSTS.focusChat);

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const openai = getOpenAIClient();

    // Build seniority context for coaching
    const levelLabels = { intern: 'intern', junior: 'junior', mid: 'mid-level', senior: 'senior', staff: 'staff/principal', lead: 'lead/director' };
    const levelLabel = levelLabels[seniorityLevel] || 'mid-level';
    const seniorityContext = seniorityLevel && seniorityLevel !== 'mid'
      ? `\nThe user is preparing for a ${levelLabel} position. Calibrate question depth and complexity accordingly — ${
          ['staff', 'lead'].includes(seniorityLevel)
            ? 'focus on architecture trade-offs, system design, and leadership. Avoid basic syntax questions.'
            : seniorityLevel === 'senior'
            ? 'focus on deep technical discussions and trade-offs. Avoid introductory questions.'
            : ['junior', 'intern'].includes(seniorityLevel)
            ? 'focus on fundamentals and practical patterns. Build up gradually from basics.'
            : ''
        }`
      : '';

    const systemPrompt = `You are a focused skill coach helping a software engineer improve their understanding of: ${skill}.
${seniorityContext}
Your approach:
- Start by asking a diagnostic question to gauge their current level
- Use Socratic questioning — guide them to discover answers rather than lecturing
- When you identify a gap, give a brief, clear explanation (2-3 sentences) then ask a follow-up to check understanding
- Provide concrete examples, analogies, and real-world scenarios
- If they answer well, increase difficulty progressively
- Be encouraging but precise — correct misconceptions immediately
- Keep responses concise (2-3 paragraphs max)
- Use markdown for code snippets when relevant

You are NOT an interviewer. You are a patient, expert tutor. Your goal is to build their understanding from wherever they currently are.`;

    const gptMessages = [{ role: 'system', content: systemPrompt }];

    // Cap history to last 20 messages
    const recentMessages = (messages || []).slice(-20);

    if (recentMessages.length > 0) {
      recentMessages.forEach(msg => {
        const content = typeof msg.content === 'string' ? msg.content.substring(0, 3000) : '';
        if (msg.role === 'coach') {
          gptMessages.push({ role: 'assistant', content });
        } else if (msg.role === 'user') {
          gptMessages.push({ role: 'user', content });
        }
      });
    } else {
      gptMessages.push({
        role: 'user',
        content: `I want to improve my understanding of ${skill}. Start by asking me a diagnostic question.`
      });
    }

    // Stream from OpenAI
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: gptMessages,
      temperature: 0.8,
      max_tokens: 800,
      stream: true,
    });

    let fullReply = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullReply += delta;
        res.write(`data: ${JSON.stringify({ type: 'token', content: delta })}\n\n`);
      }
    }

    // After stream: evaluate user's last message and record attempt
    let evaluation = null;

    if (recentMessages.length > 0) {
      const lastUserMsg = recentMessages.filter(m => m.role === 'user').pop();
      if (lastUserMsg) {
        try {
          const evalCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: `Score this answer about ${skill} from 0-100. Return JSON only: {"score": N, "feedback": "brief feedback"}` },
              { role: 'user', content: lastUserMsg.content }
            ],
            temperature: 0.3,
            max_tokens: 150,
          });

          const evalText = evalCompletion.choices[0].message.content.trim();
          const jsonMatch = evalText.match(/\{[\s\S]*\}/);
          if (jsonMatch) evaluation = JSON.parse(jsonMatch[0]);
        } catch (e) {
          evaluation = { score: 50, feedback: 'Practice recorded' };
        }

        try {
          await recordAttempt(user.id, {
            jobDescriptionHash: '',
            sessionId: sessionId || null,
            questionText: `[Focus] ${skill}: ${lastUserMsg.content.substring(0, 100)}`,
            questionCategory: skill,
            attemptType: 'quiz',
            userAnswer: lastUserMsg.content,
            score: evaluation?.score || 50,
            evaluation: evaluation || { score: 50, feedback: 'Focus practice' },
          });
        } catch (attemptError) {
          console.error('Focus chat attempt error (non-critical):', attemptError.message);
        }

        // Update user_topic_scores so Drills page reflects practice
        try {
          const drillable = !isCompanySpecificTopic(skill);
          const topic = await getOrCreateTopic(skill, null, null, { isDrillable: drillable });
          if (topic) {
            const score = evaluation?.score || 50;
            await updateUserTopicScore(user.id, topic.id, score, score >= 70);
          }
        } catch (topicErr) {
          console.error('Focus chat topic score update (non-critical):', topicErr.message);
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done', evaluation })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Error in /api/chat/focus:', error);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Stream failed' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: error.message || 'Failed to process focus chat' });
    }
  }
});

// Helper function to extract funding rounds from text
function extractFundingFromText(text, currentYear) {
  const fundingRounds = [];
  if (!text) return fundingRounds;

  // Patterns to match funding information
  const patterns = [
    // Pattern 1: "$150M Series D" or "$150 million Series D"
    /\$(\d+(?:\.\d+)?)\s*(?:million|M|billion|B)\s+(?:in\s+)?(?:a\s+)?(Seed|Series\s+[A-Z]|Series\s+[A-Z]\s+funding|round)/gi,
    // Pattern 2: "raised $150M" or "raised $150 million"
    /raised\s+\$(\d+(?:\.\d+)?)\s*(?:million|M|billion|B)(?:\s+in\s+(?:a\s+)?(Seed|Series\s+[A-Z]|Series\s+[A-Z]\s+funding|round))?/gi,
    // Pattern 3: "Series D round of $150M"
    /(Seed|Series\s+[A-Z]|Series\s+[A-Z]\s+funding|round)\s+(?:of\s+)?\$(\d+(?:\.\d+)?)\s*(?:million|M|billion|B)/gi,
    // Pattern 4: "unicorn status" or "reached unicorn" (usually $1B+)
    /(?:reached|achieved|attained)\s+unicorn\s+status/gi,
  ];

  const fundingMatches = [];
  
  // Extract funding mentions
  patterns.forEach((pattern, idx) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach(match => {
      if (idx === 3) {
        // Unicorn status - assume $1B
        fundingMatches.push({
          amount: '$1B',
          type: 'Unicorn',
          fullMatch: match[0]
        });
      } else if (match[1] && match[2]) {
        fundingMatches.push({
          amount: `$${match[1]}${match[0].includes('billion') || match[0].includes('B') ? 'B' : 'M'}`,
          type: match[2].replace(/\s+funding|\s+round/gi, '').trim(),
          fullMatch: match[0]
        });
      } else if (match[1]) {
        fundingMatches.push({
          amount: `$${match[1]}${match[0].includes('billion') || match[0].includes('B') ? 'B' : 'M'}`,
          type: 'Funding Round',
          fullMatch: match[0]
        });
      }
    });
  });

  // Extract year/month from context around the match
  fundingMatches.forEach((match, idx) => {
    const matchIndex = text.indexOf(match.fullMatch);
    const context = text.substring(Math.max(0, matchIndex - 100), matchIndex + match.fullMatch.length + 100);
    
    // Try to find year
    const yearMatch = context.match(/\b(20\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[1]) : currentYear;
    
    // Try to find month
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthMatch = months.find(m => context.toLowerCase().includes(m.toLowerCase()));
    
    // Try to find lead investors
    const investorPatterns = [
      /led\s+by\s+([A-Z][a-zA-Z\s&,]+?)(?:,|\s+and|$)/i,
      /investors?\s+(?:include|are|:)\s+([A-Z][a-zA-Z\s&,]+?)(?:,|\s+and|$)/i,
      /(?:from|by)\s+([A-Z][a-zA-Z\s&,]+?)(?:\s+and|$)/i
    ];
    
    let leadInvestors = [];
    investorPatterns.forEach(pattern => {
      const invMatch = context.match(pattern);
      if (invMatch && invMatch[1]) {
        leadInvestors = invMatch[1].split(/,\s*|\s+and\s+/).map(i => i.trim()).filter(i => i.length > 0);
      }
    });

    fundingRounds.push({
      year: year,
      month: monthMatch || null,
      type: match.type,
      amount: match.amount,
      leadInvestors: leadInvestors.length > 0 ? leadInvestors : null,
      description: match.fullMatch,
      source: 'company_research'
    });
  });

  // Remove duplicates (same year + type + similar amount)
  const uniqueRounds = [];
  fundingRounds.forEach(round => {
    const exists = uniqueRounds.some(existing => 
      existing.year === round.year &&
      existing.type === round.type &&
      Math.abs(parseFloat(existing.amount.replace(/[^0-9.]/g, '')) - parseFloat(round.amount.replace(/[^0-9.]/g, ''))) < 10
    );
    if (!exists) {
      uniqueRounds.push(round);
    }
  });

  return uniqueRounds;
}

// API endpoint to get company research/insights
// MOVED: Placed immediately after voice/evaluate to group all POST routes together
// Get company info (founders, funding, etc.)
app.get('/api/company/info/:companyName', async (req, res) => {
  try {
    const { companyName } = req.params
    const companyData = await getCompanyFullData(companyName)
    
    if (!companyData) {
      return res.status(404).json({ error: 'Company not found' })
    }
    
    res.json({
      name: companyData.name,
      founded: companyData.founded,
      description: companyData.description,
      founders: companyData.founders || [],
      fundingRounds: companyData.fundingRounds || []
    })
  } catch (error) {
    console.error('Error getting company info:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/company/research', requireAuth, async (req, res) => {
  // Check if user is authenticated (optional for preview mode)
  const sessionToken = req.headers.authorization?.replace('Bearer ', '');
  const user = sessionToken ? await getUserFromSession(sessionToken) : null;
  
  console.log('\n🟢 ✅ === COMPANY RESEARCH ENDPOINT HIT ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('URL:', req.url);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('==========================================\n');
  
  try {
    const researchRl = rateLimit(req.user.id, 'companyResearch', 10, 10 * 60 * 1000);
    if (!researchRl.allowed) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.', retryAfter: researchRl.retryAfter });
    }

    const { companyName, jobDescription } = req.body;

    console.log('[Company Research] Request received:', { 
      companyName, 
      hasJobDescription: !!jobDescription,
      path: req.path,
      method: req.method
    });

    if (!companyName || companyName === 'Company') {
      return res.status(400).json({ error: 'Valid company name is required' });
    }

    // Check database first
    try {
      const cached = await getCompanyFullData(companyName);
      if (cached && cached.research) {
        console.log(`📦 Using database company research for: ${companyName}`);
        const extractedFundingRounds = extractFundingFromText(
          [...(cached.research.recentNews || []), ...(cached.research.achievements || [])].join(' '),
          new Date().getFullYear()
        );
        
        return res.json({ 
          success: true, 
          research: cached.research,
          extractedFundingRounds: cached.research.recentFundingRounds || extractedFundingRounds,
          fromCache: true
        });
      }
    } catch (dbError) {
      console.log('Database lookup failed, fetching from OpenAI:', dbError.message);
    }

    // Cache miss — check and deduct training credits before calling OpenAI
    const creditCheck = await checkTrainingCredits(req.user.id, TRAINING_CREDIT_COSTS.companyResearch);
    if (!creditCheck.hasCredits) {
      return res.status(402).json({
        error: 'Insufficient training credits',
        resourceType: 'trainingCredits',
        remaining: creditCheck.remaining,
        required: TRAINING_CREDIT_COSTS.companyResearch,
        upgradeRequired: true
      });
    }
    await deductTrainingCredits(req.user.id, TRAINING_CREDIT_COSTS.companyResearch);

    const openai = getOpenAIClient();
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    const prompt = `Provide comprehensive research and insights about the company "${companyName}".

${jobDescription ? `Job Context: ${jobDescription.substring(0, 1500)}` : ''}

IMPORTANT: Current date is ${currentYear}-${String(currentMonth).padStart(2, '0')}. Only include news from the past 6 months (${currentYear} only, no 2021, 2022, 2023, or 2024 unless it's December 2024 and we're in early 2025). If there's no recent news in the past 6 months, use an empty array.

Please provide:
1. Recent news and developments (ONLY from the past 6 months - ${currentYear} only, exclude anything from 2021-2024 unless absolutely necessary and very recent). If any news mentions funding rounds, include details like amount, round type (Seed, Series A/B/C/D, etc.), and year.
2. Company culture and values
3. Tech stack and tools they use (if tech company)
4. Team structure and size
5. Recent achievements or milestones (from past 6 months only)
6. What makes them unique
7. Interview tips specific to this company
8. What they value in candidates
9. Recent funding rounds (if any from past 6 months) - include: year, month (if available), round type, amount, lead investors

Format as JSON:
{
  "recentNews": ["News item 1 from past 6 months only", "News item 2 from past 6 months only"],
  "culture": "Description of company culture",
  "techStack": ["Technology 1", "Technology 2"],
  "teamSize": "Approximate team size",
  "achievements": ["Achievement 1 from past 6 months", "Achievement 2 from past 6 months"],
  "uniqueAspects": ["What makes them unique"],
  "interviewTips": ["Tip 1", "Tip 2"],
  "values": ["Value 1", "Value 2"],
  "recentFundingRounds": [
    {
      "year": 2025,
      "month": "January",
      "type": "Series D",
      "amount": "$150M",
      "leadInvestors": ["Investor Name"],
      "description": "Funding round description"
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are a company research expert. Provide accurate, up-to-date information about companies."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const responseText = completion.choices[0].message.content.trim();
    let research;
    
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        research = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      research = {
        recentNews: [],
        culture: 'Information not available',
        techStack: [],
        teamSize: 'Unknown',
        achievements: [],
        uniqueAspects: [],
        interviewTips: [],
        values: []
      };
    }

    console.log('Company research response:', { 
      hasResearch: !!research, 
      keys: research ? Object.keys(research) : [],
      fundingRoundsFound: research.recentFundingRounds?.length || 0
    });
    
    // Save to database for future use
    try {
      await saveCompanyResearch(companyName, research);
    } catch (saveError) {
      console.log('Failed to save company research to database (non-critical):', saveError.message);
    }
    
    // Return both research and extracted funding rounds for merging
    res.json({ 
      success: true, 
      research,
      extractedFundingRounds: research.recentFundingRounds || [],
      fromCache: false
    });
  } catch (error) {
    console.error('Error in /api/company/research:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Failed to get company research',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Auth endpoints moved to top (after middleware, before other routes)

// ==================== STRIPE ENDPOINTS ====================

// Create checkout session
app.post('/api/stripe/create-checkout', requireAuth, async (req, res) => {
  try {
    const { plan, interval = 'monthly' } = req.body;

    if (!PLANS[plan] || !PLANS[plan].price) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    if (!['monthly', 'quarterly', 'annual'].includes(interval)) {
      return res.status(400).json({ error: 'Invalid interval' });
    }

    const successUrl = `${req.headers.origin || 'http://localhost:5000'}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${req.headers.origin || 'http://localhost:5000'}/billing/cancel`;

    const session = await createCheckoutSession(req.user.id, plan, successUrl, cancelUrl, interval);
    
    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stripe webhook
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }
  
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  try {
    await handleWebhook(event);
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create customer portal session
app.post('/api/stripe/create-portal', requireAuth, async (req, res) => {
  try {
    if (!req.user.stripeCustomerId) {
      return res.status(400).json({ error: 'No active subscription' });
    }
    
    const returnUrl = `${req.headers.origin || 'http://localhost:5000'}/billing`;
    const session = await createPortalSession(req.user.stripeCustomerId, returnUrl);
    
    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create advertiser checkout session ($999/month)
app.post('/api/stripe/create-advertiser-checkout', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const { companyName, email } = req.body;
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'intrview.io Advertiser Spot',
            description: 'Monthly advertising spot - Next month reservation' + (companyName ? ` (${companyName})` : '')
          },
          recurring: {
            interval: 'month'
          },
          unit_amount: 99900 // $999 in cents
        },
        quantity: 1
      }],
      mode: 'subscription',
      success_url: `${req.headers.origin || 'http://localhost:5000'}/advertiser-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'http://localhost:5000'}/advertiser-cancel`,
      customer_email: email,
      metadata: {
        type: 'advertiser',
        company: companyName || 'Unknown'
      }
    });
    
    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Error creating advertiser checkout:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
});

// ==================== QUESTIONS MANAGEMENT ====================

// Generate more questions without duplicates
app.post('/api/questions/generate-more', requireAuth, requireTrainingCredits('studyPlan'), async (req, res) => {
  try {
    const { jobDescriptionHash, existingQuestions, companyName, roleTitle, techStack } = req.body;
    
    if (!existingQuestions || !Array.isArray(existingQuestions)) {
      return res.status(400).json({ error: 'Existing questions are required' });
    }

    const openai = getOpenAIClient();
    
    // Try to get study plan for context (optional - we can work without it)
    let jobDescription = '';
    try {
      const studyPlan = await getCachedStudyPlan(jobDescriptionHash);
      if (studyPlan && studyPlan.studyPlan) {
        // Extract job description context from study plan if available
        jobDescription = JSON.stringify(studyPlan.studyPlan).substring(0, 1000);
      }
    } catch (e) {
      console.log('Could not load study plan for context:', e.message);
    }
    
    // Create list of existing questions to exclude
    const existingQuestionsText = existingQuestions
      .map(q => typeof q === 'string' ? q : q.question)
      .join('\n- ');
    
    // Extract existing categories to maintain consistency
    const existingCategories = [...new Set(
      existingQuestions
        .map(q => typeof q === 'string' ? null : q.category)
        .filter(Boolean)
    )];
    const categoryHint = existingCategories.length > 0
      ? `Existing categories used: ${existingCategories.join(', ')}. Use these same categories AND add new specific ones as needed.`
      : '';

    const prompt = `Generate NEW interview questions for ${companyName} ${roleTitle} position.

IMPORTANT: These questions must be DIFFERENT from the existing ones. Do NOT repeat any of these:
${existingQuestionsText}

Focus on:
1. Company-specific culture and values questions about ${companyName}
2. Technical questions about their tech stack: ${techStack || 'extract from job description'}
3. Role-specific questions for ${roleTitle}
4. Behavioral questions relevant to ${companyName}'s work style
5. Advanced technical scenarios and edge cases
6. System design questions if applicable
7. Real-world problem-solving scenarios

${categoryHint}

CRITICAL — CATEGORY RULES:
- Use SPECIFIC, DESCRIPTIVE categories — NEVER just "Technical" or "Behavioral"
- Good categories: "React & Frontend", "Node.js & APIs", "System Design", "Databases & SQL", "Leadership & Collaboration", "${companyName} Culture", "Problem Solving", "DevOps & Deployment", "Architecture Patterns", "Communication & Teamwork"
- Spread questions across at least 4-5 different categories

Generate 10-15 NEW unique questions.
Format as JSON array of question objects:
[
  {
    "question": "Question text",
    "category": "Specific category (e.g., 'React & Frontend', NOT just 'Technical')",
    "answer": "Comprehensive answer",
    "tips": "Additional tips"
  }
]`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an expert technical interviewer. Generate unique, high-quality interview questions. Always return valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' }
    });

    let newQuestions = [];
    try {
      const responseText = completion.choices[0].message.content;
      const parsed = JSON.parse(responseText);
      // Handle both array and object formats
      if (Array.isArray(parsed)) {
        newQuestions = parsed;
      } else if (parsed.questions && Array.isArray(parsed.questions)) {
        newQuestions = parsed.questions;
      } else if (parsed.question) {
        // Single question object
        newQuestions = [parsed];
      } else {
        // Try to find questions array in nested structure
        newQuestions = Object.values(parsed).find(v => Array.isArray(v)) || [];
      }
    } catch (parseError) {
      console.error('Error parsing questions response:', parseError);
      // Try to extract questions from text if JSON parsing fails
      const responseText = completion.choices[0].message.content;
      const questionMatches = responseText.match(/"question"\s*:\s*"([^"]+)"/g);
      if (questionMatches) {
        newQuestions = questionMatches.map(match => {
          const questionText = match.match(/"question"\s*:\s*"([^"]+)"/)?.[1];
          return questionText ? {
            question: questionText,
            category: 'Technical',
            answer: 'See study plan for details',
            tips: ''
          } : null;
        }).filter(Boolean);
      }
    }

    // Filter out any duplicates
    const existingQuestionTexts = new Set(
      existingQuestions.map(q => 
        (typeof q === 'string' ? q : q.question).toLowerCase().trim()
      )
    );
    
    const uniqueQuestions = newQuestions.filter(q => {
      const questionText = (q.question || q).toLowerCase().trim();
      return !existingQuestionTexts.has(questionText);
    });

    // Deduct training credits
    await deductTrainingCredits(req.user.id, TRAINING_CREDIT_COSTS.studyPlan);

    // Persist new questions into the cached study plan so they survive page reloads
    if (uniqueQuestions.length > 0 && jobDescriptionHash) {
      try {
        const cachedPlan = await getCachedStudyPlan(jobDescriptionHash);
        if (cachedPlan) {
          // Find the stages array (handle both nested and flat structures)
          const stages = cachedPlan.interviewQuestions?.stages
            || cachedPlan.studyPlan?.interviewQuestions?.stages;
          if (stages && stages.length > 0) {
            // Append to a "Generated Questions" stage, or create one
            let genStage = stages.find(s =>
              s.stageName === 'Generated Questions' || s.stageName === 'Additional Questions'
            );
            if (!genStage) {
              genStage = { stageName: 'Generated Questions', questions: [] };
              stages.push(genStage);
            }
            if (!genStage.questions) genStage.questions = [];
            genStage.questions.push(...uniqueQuestions);
            await saveStudyPlan(jobDescriptionHash, cachedPlan);
          }
        }
      } catch (saveErr) {
        console.log('Failed to persist generated questions (non-critical):', saveErr.message);
      }
    }

    res.json({
      success: true,
      questions: uniqueQuestions,
      count: uniqueQuestions.length
    });
  } catch (error) {
    console.error('Error generating more questions:', error);
    res.status(500).json({ error: error.message || 'Failed to generate questions' });
  }
});

// ==================== CREDIT MANAGEMENT ====================

// Get user credits
app.get('/api/credits', requireAuth, async (req, res) => {
  try {
    const u = req.user;
    res.json({
      jobAnalyses: {
        remaining: u.jobAnalysesRemaining,
        monthly: u.jobAnalysesMonthlyAllowance,
      },
      trainingCredits: {
        remaining: u.trainingCreditsRemaining,
        monthly: u.trainingCreditsMonthlyAllowance,
      },
      isLifetimePlan: u.isLifetimePlan,
      plan: u.plan,
      // Legacy fields
      remaining: u.creditsRemaining,
      monthlyAllowance: u.creditsMonthlyAllowance,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: list all users with subscription info
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.created_at,
        COALESCE(s.plan, 'free')                   AS plan,
        COALESCE(s.status, 'active')               AS subscription_status,
        COALESCE(s.credits_remaining, 0)           AS credits_remaining,
        COALESCE(s.credits_monthly_allowance, 0)   AS credits_monthly_allowance
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id
      ORDER BY u.created_at DESC
    `);

    const users = result.rows.map(u => ({
      ...u,
      isAdmin: isAdminUser(u.email),
    }));

    res.json({ users, total: users.length });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoint to create test user with unlimited credits
app.post('/api/admin/create-test-user', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Check if user already exists (case-insensitive)
    const existing = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      // Update existing user: password and unlimited credits
      const userId = existing.rows[0].id;
      const passwordHash = await bcrypt.hash(password, 10);
      
      // Update password
      await pool.query(
        `UPDATE users 
         SET password_hash = $1, 
             name = COALESCE($2, name),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [passwordHash, name || null, userId]
      );
      
      // Update subscription to elite with two-bucket model
      const elitePlan = PLANS.elite;
      await pool.query(
        `UPDATE subscriptions
         SET plan = 'elite',
             credits_remaining = 999999,
             credits_monthly_allowance = 999999,
             job_analyses_remaining = CASE WHEN $2 = -1 THEN 999999 ELSE $2 END,
             job_analyses_monthly_allowance = $2,
             training_credits_remaining = $3,
             training_credits_monthly_allowance = $3,
             is_lifetime_plan = false
         WHERE user_id = $1`,
        [userId, elitePlan.monthlyJobAnalyses, elitePlan.monthlyTrainingCredits]
      );
      
      return res.json({ 
        success: true, 
        message: 'User already exists - password updated and set to have unlimited credits',
        email 
      });
    }
    
    // Create new user
    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await pool.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email, name || 'Test User', passwordHash]
    );
    
    const newUser = userResult.rows[0];
    
    // Create subscription with two-bucket model
    await createNewSubscription(newUser.id, 'elite');
    
    res.json({ 
      success: true, 
      message: 'Test user created with unlimited credits',
      email,
      userId: newUser.id
    });
  } catch (error) {
    console.error('Error creating test user:', error);
    res.status(500).json({ error: error.message || 'Failed to create test user' });
  }
});

// User endpoint to get their stats
app.put('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (name !== undefined && typeof name !== 'string') {
      return res.status(400).json({ error: 'Name must be a string' });
    }
    const trimmedName = name ? name.trim().slice(0, 255) : null;
    const result = await pool.query(
      'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name',
      [trimmedName, req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.get('/api/user/stats', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const stats = await getUserStats(user.id);
    res.json(stats);
  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// User endpoint to get their job analyses
app.get('/api/user/analyses', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    const analyses = await getUserJobAnalyses(user.id, limit, offset);
    res.json(analyses);
  } catch (error) {
    console.error('Error getting user job analyses:', error);
    res.status(500).json({ error: error.message });
  }
});

// User endpoint to get full analysis result by DB id
app.get('/api/user/analysis/:id', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;

    const analysisRes = await pool.query(
      `SELECT ja.*, juc.logo_url
       FROM job_analyses ja
       LEFT JOIN job_url_cache juc ON ja.url = juc.url
       WHERE ja.id = $1 AND ja.user_id = $2`,
      [id, user.id]
    );

    if (analysisRes.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const analysis = analysisRes.rows[0];
    const studyPlan = await getCachedStudyPlan(analysis.job_description_hash);

    // Fetch full company data (founders, funding, research)
    let companyData = null;
    if (analysis.company_name) {
      try {
        companyData = await getCompanyFullData(analysis.company_name);
      } catch (e) {
        console.error('Error loading company data:', e.message);
      }
    }

    res.json({
      success: true,
      jobDescription: '',
      jobDescriptionHash: analysis.job_description_hash,
      companyInfo: {
        name: analysis.company_name,
        roleTitle: analysis.role_title,
        logoUrl: analysis.logo_url || null,
        founded: companyData?.founded || null,
        description: companyData?.description || null,
        website: companyData?.company_website || null,
        linkedinUrl: companyData?.linkedin_url || null,
        founders: companyData?.founders || [],
        fundingRounds: companyData?.fundingRounds || [],
      },
      companyResearch: companyData?.research || null,
      studyPlan: studyPlan || null,
      url: analysis.url,
    });
  } catch (error) {
    console.error('Error getting analysis by id:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete all user job analyses
app.delete('/api/user/analyses', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    await pool.query('DELETE FROM job_analyses WHERE user_id = $1', [user.id]);
    await pool.query('DELETE FROM user_topic_scores WHERE user_id = $1', [user.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user analyses:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/user/analysis/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT job_description_hash FROM job_analyses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const hash = result.rows[0].job_description_hash;

    await pool.query('DELETE FROM job_analyses WHERE id = $1 AND user_id = $2', [id, userId]);

    const otherUses = await pool.query(
      'SELECT id FROM job_analyses WHERE job_description_hash = $1 AND id != $2',
      [hash, id]
    );
    if (otherUses.rows.length === 0) {
      await pool.query('DELETE FROM job_topics WHERE job_description_hash = $1', [hash]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting analysis:', error);
    res.status(500).json({ error: 'Failed to delete analysis' });
  }
});

// User endpoint to get study plan by hash (only if user has analyzed it)
app.get('/api/user/study-plan/:hash', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { hash } = req.params;
    
    // Verify user has access to this study plan
    const userAnalysis = await pool.query(
      'SELECT * FROM job_analyses WHERE user_id = $1 AND job_description_hash = $2',
      [user.id, hash]
    );
    
    if (userAnalysis.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const studyPlan = await getCachedStudyPlan(hash);
    
    if (!studyPlan) {
      return res.json(null);
    }
    
    res.json(studyPlan);
  } catch (error) {
    console.error('Error getting study plan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Advertisers API route
app.get('/api/advertisers', async (req, res) => {
  try {
    const advertisers = await getActiveAdvertisers();
    
    // If no advertisers in DB, seed with 20 less-known, actively hiring companies
    if (advertisers.length === 0) {
      console.log('🌱 Seeding advertisers table with 20 companies...');
      const defaultAdvertisers = [
        { name: 'Replicate', domain: 'replicate.com', description: 'Run ML models in the cloud. Hiring ML engineers and infrastructure builders.', websiteUrl: 'https://replicate.com/jobs', jobCount: 8, isActivelyHiring: true },
        { name: 'Modal', domain: 'modal.com', description: 'Serverless GPU platform. Hiring engineers and ML researchers.', websiteUrl: 'https://modal.com/careers', jobCount: 12, isActivelyHiring: true },
        { name: 'Cursor', domain: 'cursor.sh', description: 'AI-powered code editor. Hiring engineers and product designers.', websiteUrl: 'https://cursor.sh/careers', jobCount: 6, isActivelyHiring: true },
        { name: 'Hugging Face', domain: 'huggingface.co', description: 'Open source ML platform. Hiring researchers and engineers.', websiteUrl: 'https://huggingface.co/jobs', jobCount: 15, isActivelyHiring: true },
        { name: 'Cohere', domain: 'cohere.com', description: 'Enterprise AI platform. Hiring ML engineers and researchers.', websiteUrl: 'https://cohere.com/careers', jobCount: 10, isActivelyHiring: true },
        { name: 'Replit', domain: 'replit.com', description: 'Online IDE and hosting. Hiring engineers and designers.', websiteUrl: 'https://replit.com/careers', jobCount: 9, isActivelyHiring: true },
        { name: 'Temporal', domain: 'temporal.io', description: 'Workflow orchestration platform. Hiring engineers and SREs.', websiteUrl: 'https://temporal.io/careers', jobCount: 7, isActivelyHiring: true },
        { name: 'Clerk', domain: 'clerk.com', description: 'Authentication and user management. Hiring engineers and designers.', websiteUrl: 'https://clerk.com/careers', jobCount: 11, isActivelyHiring: true },
        { name: 'Retool', domain: 'retool.com', description: 'Internal tool builder. Hiring engineers and product managers.', websiteUrl: 'https://retool.com/careers', jobCount: 14, isActivelyHiring: true },
        { name: 'PostHog', domain: 'posthog.com', description: 'Product analytics platform. Hiring engineers and data scientists.', websiteUrl: 'https://posthog.com/careers', jobCount: 13, isActivelyHiring: true },
        { name: 'Cal.com', domain: 'cal.com', description: 'Open source scheduling. Hiring engineers and designers.', websiteUrl: 'https://cal.com/careers', jobCount: 5, isActivelyHiring: true },
        { name: 'Plausible', domain: 'plausible.io', description: 'Privacy-friendly analytics. Hiring engineers and marketers.', websiteUrl: 'https://plausible.io/careers', jobCount: 4, isActivelyHiring: false },
        { name: 'Fathom', domain: 'usefathom.com', description: 'Privacy-first analytics. Hiring engineers and support.', websiteUrl: 'https://usefathom.com/careers', jobCount: 6, isActivelyHiring: true },
        { name: 'Buttondown', domain: 'buttondown.email', description: 'Email newsletter platform. Hiring engineers and designers.', websiteUrl: 'https://buttondown.email/careers', jobCount: 3, isActivelyHiring: false },
        { name: 'ConvertKit', domain: 'convertkit.com', description: 'Email marketing for creators. Hiring engineers and support.', websiteUrl: 'https://convertkit.com/careers', jobCount: 8, isActivelyHiring: true },
        { name: 'Ghost', domain: 'ghost.org', description: 'Publishing platform. Hiring engineers and designers.', websiteUrl: 'https://ghost.org/careers', jobCount: 7, isActivelyHiring: true },
        { name: 'Buffer', domain: 'buffer.com', description: 'Social media management. Hiring engineers and marketers.', websiteUrl: 'https://buffer.com/jobs', jobCount: 9, isActivelyHiring: true },
        { name: 'Doppler', domain: 'doppler.com', description: 'Secrets management. Hiring engineers and SREs.', websiteUrl: 'https://doppler.com/careers', jobCount: 5, isActivelyHiring: true },
        { name: 'Porter', domain: 'porter.run', description: 'Kubernetes platform. Hiring engineers and DevOps.', websiteUrl: 'https://porter.run/careers', jobCount: 6, isActivelyHiring: true },
        { name: 'Render', domain: 'render.com', description: 'Cloud hosting platform. Hiring engineers and SREs.', websiteUrl: 'https://render.com/careers', jobCount: 10, isActivelyHiring: true },
        { name: 'Netflix', domain: 'netflix.com', description: 'Entertainment streaming platform. Hiring engineers and data scientists.', websiteUrl: 'https://jobs.netflix.com', jobCount: 25, isActivelyHiring: true },
        { name: 'Airbnb', domain: 'airbnb.com', description: 'Travel and experiences platform. Hiring across all teams.', websiteUrl: 'https://careers.airbnb.com', jobCount: 18, isActivelyHiring: true },
        { name: 'GitHub', domain: 'github.com', description: 'Where the world builds software. Open positions in engineering and product.', websiteUrl: 'https://github.com/careers', jobCount: 12, isActivelyHiring: true },
        { name: 'Meta', domain: 'meta.com', description: 'Building the metaverse. Hiring engineers, researchers, and designers.', websiteUrl: 'https://www.metacareers.com', jobCount: 30, isActivelyHiring: true },
        { name: 'Amazon', domain: 'amazon.com', description: 'E-commerce and cloud computing. Hiring across all engineering teams.', websiteUrl: 'https://www.amazon.jobs', jobCount: 50, isActivelyHiring: true },
        { name: 'Supabase', domain: 'supabase.com', description: 'Open source Firebase alternative. Hiring engineers and developers.', websiteUrl: 'https://supabase.com/careers', jobCount: 8, isActivelyHiring: true },
        { name: 'Cloudflare', domain: 'cloudflare.com', description: 'Web infrastructure and security. Hiring engineers and SREs.', websiteUrl: 'https://www.cloudflare.com/careers', jobCount: 15, isActivelyHiring: true },
        { name: 'Railway', domain: 'railway.app', description: 'Deploy and scale applications. Hiring engineers and DevOps.', websiteUrl: 'https://railway.app/careers', jobCount: 6, isActivelyHiring: true },
        { name: 'Resend', domain: 'resend.com', description: 'Email API for developers. Hiring engineers and product builders.', websiteUrl: 'https://resend.com/careers', jobCount: 5, isActivelyHiring: true }
      ];
      
      // Create or update all advertisers (update job counts if they exist)
      for (const ad of defaultAdvertisers) {
        try {
          await getOrCreateAdvertiser(ad.name, ad.domain, ad.description, ad.websiteUrl, ad.jobCount, ad.isActivelyHiring);
          console.log(`✅ Created/updated advertiser: ${ad.name} (${ad.jobCount} jobs)`);
        } catch (error) {
          console.error(`❌ Failed to create advertiser ${ad.name}:`, error.message);
        }
      }
      
      // Force update ALL existing advertisers with job counts and hiring status
      console.log('🔄 Force updating ALL advertisers with job counts and hiring status...');
      const existingAdvertisers = await getActiveAdvertisers();
      for (const existing of existingAdvertisers) {
        // Find matching default advertiser
        const defaultAd = defaultAdvertisers.find(d => d.domain === existing.domain);
        if (defaultAd) {
          try {
            const result = await pool.query(
              `UPDATE advertisers 
               SET job_count = $1, 
                   is_actively_hiring = $2,
                   updated_at = CURRENT_TIMESTAMP
               WHERE domain = $3
               RETURNING job_count, is_actively_hiring`,
              [defaultAd.jobCount, defaultAd.isActivelyHiring, existing.domain]
            );
            console.log(`✅ Updated ${existing.name}: ${result.rows[0].job_count} jobs, hiring=${result.rows[0].is_actively_hiring}`);
          } catch (error) {
            console.error(`❌ Failed to update ${existing.name}:`, error.message);
          }
        } else {
          // If no match found, set default values
          try {
            await pool.query(
              `UPDATE advertisers 
               SET job_count = COALESCE(job_count, 5), 
                   is_actively_hiring = COALESCE(is_actively_hiring, true),
                   updated_at = CURRENT_TIMESTAMP
               WHERE domain = $1`,
              [existing.domain]
            );
            console.log(`⚠️ Set default values for ${existing.name} (no match in default list)`);
          } catch (error) {
            console.error(`❌ Failed to set defaults for ${existing.name}:`, error.message);
          }
        }
      }
      
      // Log final advertisers with job counts
      const finalAdvertisers = await getActiveAdvertisers();
      console.log('📊 Final advertisers with job counts:', finalAdvertisers.map(a => ({ 
        name: a.name, 
        job_count: a.job_count,
        job_count_type: typeof a.job_count,
        domain: a.domain 
      })));
      
      // Force cache logos for ALL advertisers (even if they have one, refresh it)
      console.log('🖼️  Fetching and caching logos for all advertisers...');
      for (const ad of finalAdvertisers) {
        try {
          // Use Google Favicon API (more reliable than clearbit which may be blocked)
          // This provides high-quality favicons that work consistently
          const logoUrl = `https://www.google.com/s2/favicons?domain=${ad.domain}&sz=128`;
          
          // Cache the Google Favicon URL - it's reliable and works in img tags
          await updateAdvertiserLogo(ad.domain, logoUrl);
          console.log(`✅ Set logo URL for ${ad.domain}: ${logoUrl}`);
        } catch (error) {
          console.log(`⚠️ Could not set logo URL for ${ad.domain}:`, error.message);
        }
      }
      
      // Job count scraping removed - descriptions already indicate hiring status
      
      // Re-fetch advertisers with updated logo URLs
      const advertisersWithLogos = await getActiveAdvertisers();
      
      // Log final state
      console.log('📤 Returning advertisers with logos:', advertisersWithLogos.length)
      advertisersWithLogos.forEach(ad => {
        console.log(`  ✅ ${ad.name}: job_count=${ad.job_count}, hiring=${ad.is_actively_hiring}, logo=${ad.logo_url ? 'SET' : 'NULL'}`)
      })
      
      // Return the updated advertisers with logos
      return res.json(advertisersWithLogos);
    }
    
    // Force cache logos for all advertisers if they don't have one
    console.log('🖼️  Checking and caching missing logos...');
    for (const ad of advertisers) {
      if (!ad.logo_url) {
        try {
          // Use Google Favicon API (more reliable than clearbit)
          const logoUrl = `https://www.google.com/s2/favicons?domain=${ad.domain}&sz=128`;
          await updateAdvertiserLogo(ad.domain, logoUrl);
          ad.logo_url = logoUrl; // Update in memory too
          console.log(`✅ Set logo URL for ${ad.domain}: ${logoUrl}`);
        } catch (error) {
          console.log(`⚠️ Could not set logo URL for ${ad.domain}:`, error.message);
        }
      }
    }
    
    // Log what we're returning with full details
    console.log('📤 Returning advertisers:', advertisers.length, 'items');
    advertisers.slice(0, 3).forEach(ad => {
      console.log(`  📋 ${ad.name}:`, {
        job_count: ad.job_count,
        job_count_type: typeof ad.job_count,
        is_actively_hiring: ad.is_actively_hiring,
        hiring_type: typeof ad.is_actively_hiring,
        logo_url: ad.logo_url,
        domain: ad.domain
      });
    });
    
    res.json(advertisers);
  } catch (error) {
    console.error('Error fetching advertisers:', error);
    res.status(500).json({ error: 'Failed to fetch advertisers' });
  }
});

// Mount practice/progress routes
app.use(practiceRouter);
app.use('/api/mock-interview', mockInterviewRouter);

// Topic API endpoints
app.get('/api/user/topic-scores', requireAuth, async (req, res) => {
  try {
    const scores = await getUserTopicScores(req.user.id);
    res.json(scores);
  } catch (error) {
    console.error('Error getting user topic scores:', error);
    res.status(500).json({ error: 'Failed to get topic scores' });
  }
});

app.get('/api/user/all-topics', requireAuth, async (req, res) => {
  try {
    const topics = await getAllUserTopics(req.user.id);
    res.json(topics);
  } catch (error) {
    console.error('Error getting all user topics:', error);
    res.status(500).json({ error: 'Failed to get topics' });
  }
});

app.get('/api/topics/shared', requireAuth, async (req, res) => {
  try {
    const shared = await getSharedTopicsAcrossJobs(req.user.id);
    res.json(shared);
  } catch (error) {
    console.error('Error getting shared topics:', error);
    res.status(500).json({ error: 'Failed to get shared topics' });
  }
});

app.get('/api/topics/job/:hash', requireAuth, async (req, res) => {
  try {
    const topics = await getTopicsForJob(req.params.hash);
    res.json(topics);
  } catch (error) {
    console.error('Error getting topics for job:', error);
    res.status(500).json({ error: 'Failed to get topics for job' });
  }
});

// Drill sessions API
app.post('/api/drills/sessions', requireAuth, async (req, res) => {
  try {
    const { skill, answers, avgScore, scores } = req.body;
    if (!skill) return res.status(400).json({ error: 'skill is required' });

    const drillable = !isCompanySpecificTopic(skill);
    const topic = await getOrCreateTopic(skill, null, null, { isDrillable: drillable });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const session = await saveDrillSession(req.user.id, topic.id, {
      answers: answers || 0,
      avgScore: avgScore || null,
      scores: scores || [],
      xpEarned: 0,
    });
    // Note: user_topic_scores is already updated per-answer in the /api/chat/focus endpoint
    res.json(session);
  } catch (error) {
    console.error('Error saving drill session:', error);
    res.status(500).json({ error: 'Failed to save drill session' });
  }
});

app.get('/api/drills/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await getAllDrillSessions(req.user.id);
    res.json(sessions);
  } catch (error) {
    console.error('Error getting drill sessions:', error);
    res.status(500).json({ error: 'Failed to get drill sessions' });
  }
});

app.get('/api/drills/sessions/:topicId', requireAuth, async (req, res) => {
  try {
    const sessions = await getDrillSessions(req.user.id, parseInt(req.params.topicId));
    res.json(sessions);
  } catch (error) {
    console.error('Error getting drill sessions:', error);
    res.status(500).json({ error: 'Failed to get drill sessions' });
  }
});

// Retroactively extract topics from existing study plans that haven't been indexed
app.post('/api/topics/backfill', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const analyses = await getUserJobAnalyses(user.id);
    let totalTopics = 0;
    let processedJobs = 0;

    for (const analysis of analyses) {
      const hash = analysis.job_description_hash;
      const existing = await getTopicsForJob(hash);
      if (existing.length > 0) continue;

      const cached = await getCachedStudyPlan(hash);
      if (!cached) continue;

      let plan;
      try {
        plan = typeof cached === 'string' ? JSON.parse(cached) : cached;
      } catch { continue; }

      const planTopics = plan?.studyPlan?.topics || plan?.topics || [];
      if (planTopics.length === 0) continue;

      const topicIds = [];
      const companyName = analysis.company_name || null;
      for (const topicObj of planTopics) {
        const topicName = typeof topicObj === 'string' ? topicObj : (topicObj.topic || topicObj.name || '');
        if (!topicName) continue;
        const normalized = normalizeTopicName(topicName, companyName);

        // Try fuzzy match against user's existing topics first
        const similar = await findSimilarUserTopic(normalized, user.id);
        if (similar) {
          topicIds.push(similar.id);
          continue;
        }

        const description = typeof topicObj === 'object' ? topicObj.description : null;
        const category = inferTopicCategory(topicName);
        const drillable = !isCompanySpecificTopic(topicName, companyName);
        const topic = await getOrCreateTopic(topicName, category, description, { companyName, isDrillable: drillable });
        topicIds.push(topic.id);
      }
      if (topicIds.length > 0) {
        await linkTopicsToJob(hash, topicIds);
        totalTopics += topicIds.length;
        processedJobs++;
      }
    }

    res.json({ success: true, processedJobs, totalTopics });
  } catch (error) {
    console.error('Error backfilling topics:', error);
    res.status(500).json({ error: 'Failed to backfill topics' });
  }
});

// Activity summary: streak + 7-day chart (computed from existing practice data)
app.get('/api/user/activity-summary', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 7-day activity: count sessions per day
    const last7DaysRes = await pool.query(`
      WITH days AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '6 days',
          CURRENT_DATE,
          '1 day'
        )::date AS day
      ),
      activity AS (
        SELECT DATE(completed_at) AS day, COUNT(*) AS cnt
        FROM drill_sessions WHERE user_id = $1
          AND completed_at >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY DATE(completed_at)
        UNION ALL
        SELECT DATE(ended_at) AS day, COUNT(*) AS cnt
        FROM practice_sessions WHERE user_id = $1
          AND ended_at IS NOT NULL
          AND ended_at >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY DATE(ended_at)
      )
      SELECT d.day, COALESCE(SUM(a.cnt), 0)::int AS sessions
      FROM days d
      LEFT JOIN activity a ON a.day = d.day
      GROUP BY d.day
      ORDER BY d.day
    `, [userId]);

    // All distinct practice days for streak calculation
    const practiceDaysRes = await pool.query(`
      SELECT DISTINCT practice_day FROM (
        SELECT DATE(completed_at) AS practice_day FROM drill_sessions WHERE user_id = $1
        UNION
        SELECT DATE(ended_at) AS practice_day FROM practice_sessions
          WHERE user_id = $1 AND ended_at IS NOT NULL
      ) sub
      WHERE practice_day IS NOT NULL
      ORDER BY practice_day DESC
    `, [userId]);

    const practiceDays = practiceDaysRes.rows.map(r => r.practice_day.toISOString().slice(0, 10));

    // Compute streaks
    let currentStreak = 0;
    let longestStreak = 0;

    if (practiceDays.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      // Current streak: walk backward from today or yesterday
      if (practiceDays[0] === today || practiceDays[0] === yesterday) {
        currentStreak = 1;
        for (let i = 1; i < practiceDays.length; i++) {
          const prev = new Date(practiceDays[i - 1]);
          const curr = new Date(practiceDays[i]);
          const diff = (prev - curr) / 86400000;
          if (diff === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      }

      // Longest streak
      let streak = 1;
      for (let i = 1; i < practiceDays.length; i++) {
        const prev = new Date(practiceDays[i - 1]);
        const curr = new Date(practiceDays[i]);
        const diff = (prev - curr) / 86400000;
        if (diff === 1) {
          streak++;
        } else {
          longestStreak = Math.max(longestStreak, streak);
          streak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, streak);
    }

    const practicedToday = last7DaysRes.rows.length > 0 &&
      parseInt(last7DaysRes.rows[last7DaysRes.rows.length - 1].sessions) > 0;

    const last7Days = last7DaysRes.rows.map(r => ({
      date: r.day.toISOString().slice(0, 10),
      sessions: parseInt(r.sessions),
    }));

    res.json({ currentStreak, longestStreak, practicedToday, last7Days });
  } catch (error) {
    console.error('Error getting activity summary:', error);
    res.status(500).json({ error: 'Failed to get activity summary' });
  }
});

// IMPORTANT: All API routes must be defined BEFORE this line
// Serve static files from the React app (AFTER all API routes)
app.use(express.static(path.join(__dirname, '../client/dist')));

// The "catchall" handler: for any request that doesn't match an API route, send back React's index.html file.
// IMPORTANT: This must be LAST, after all API routes and static files
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    console.log('[Catch-all GET] API route not found:', req.path);
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Catch-all for POST requests (must be AFTER the GET catch-all and static files)
// IMPORTANT: This should NOT match if specific routes are defined above
app.post('*', (req, res) => {
  // Only handle non-API routes
  if (!req.path.startsWith('/api')) {
    return res.status(404).send('Not found');
  }
  // If it's an API route that reached here, it means no specific route matched
  console.log('\n[⚠️  CATCH-ALL POST] Unmatched API route:', req.path);
  return res.status(404).json({ 
    error: 'API endpoint not found',
    path: req.path
  });
});


app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`Open your browser to http://localhost:${PORT} to use the app`);
  console.log('\n=== Registered API Routes ===');
  console.log('✅ GET  /api/auth/me');
  console.log('✅ POST /api/auth/request-code');
  console.log('✅ POST /api/auth/verify-code');
  console.log('✅ POST /api/auth/signup');
  console.log('✅ GET  /api/auth/google');
  console.log('✅ POST /api/auth/google');
  console.log('✅ POST /api/auth/logout');
  console.log('✅ POST /api/analyze');
  console.log('✅ POST /api/quiz/evaluate');
  console.log('✅ POST /api/voice/evaluate');
  console.log('✅ POST /api/company/research');
  console.log('✅ POST /api/stripe/create-checkout');
  console.log('✅ POST /api/stripe/create-advertiser-checkout');
  console.log('✅ POST /api/stripe/webhook');
  console.log('✅ POST /api/stripe/create-portal');
  console.log('✅ POST /api/questions/generate-more');
  console.log('✅ GET  /api/test');
  console.log('=============================\n');
  
  // Verify routes are actually in Express router
  console.log('🔍 Verifying route registration...');
  const routes = [];
  if (app._router && app._router.stack) {
    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        const method = Object.keys(middleware.route.methods)[0]?.toUpperCase();
        const path = middleware.route.path;
        if (path.includes('/api')) {
          routes.push(`${method} ${path}`);
        }
      }
    });
    console.log('Registered API routes in Express:', routes.sort());
    // Specifically check for request-code route
    const hasRequestCode = routes.some(r => r.includes('request-code'));
    console.log(`🔍 request-code route registered: ${hasRequestCode ? 'YES ✅' : 'NO ❌'}`);
    if (!hasRequestCode) {
      console.error('❌ ERROR: /api/auth/request-code route is NOT registered!');
      console.error('This means the route definition failed or was skipped.');
    }
  } else {
    console.log('⚠️  Could not verify routes - router stack not accessible');
  }
  console.log('');
});

