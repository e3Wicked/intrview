import express from 'express';
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
  ensureAdvertiserColumns,
  scrapeJobCountFromCareersPage,
  updateAdvertiserJobCount,
  trackJobAnalysis,
  getUserJobAnalyses,
  getUserStats,
  ensureJobAnalysesTable,
  ensureEmailVerificationCodesTable
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
  requireCredits,
  isAdminUser,
  CREDIT_COSTS,
  PLANS,
  generateVerificationCode,
  createUserWithoutPassword,
  saveVerificationCode,
  verifyCode
} from './auth.js';
import { sendVerificationCode } from './email.js';
import Stripe from 'stripe';
import gamificationRouter, { recordAttemptAndAwardXp } from './routes/gamification.js';
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
app.use(express.json());
app.use(cookieParser());

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
    const { email, name, googleId } = req.body;
    
    if (!email || !googleId) {
      return res.status(400).json({ error: 'Email and Google ID are required' });
    }
    
    const user = await createOrGetUser(email, name, googleId);
    const sessionToken = await createSession(user.id);
    
    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    
    const userWithPlan = await getUserFromSession(sessionToken);
    
    res.json({ 
      success: true, 
      user: userWithPlan,
      sessionToken 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

// Function to scrape job description from URL
async function scrapeJobDescription(url) {
  try {
    const agent = await getHttpsAgent();
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      httpsAgent: agent,
      timeout: 30000
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
    
    return { jobDescription, logo, companyWebsite, linkedinCompanyUrl };
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
async function generateStudyPlan(jobDescription, companyName = 'the company') {
  try {
    // Check database cache first
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
    
    const prompt = `You are an expert career coach and technical interviewer specializing in ${fieldContext}. Based on the following job description for ${companyName}, create a comprehensive, thoughtful study plan and interview questions.

IMPORTANT: Generate questions that are SPECIFIC to ${companyName} and their tech stack. Include:
1. Company-specific culture and values questions about ${companyName}
2. Technical questions about their specific tech stack: ${techStack || 'extract from job description'}
3. Role-specific questions for this position
4. Behavioral questions relevant to ${companyName}'s work style and industry
5. Questions that test knowledge of ${techStack ? techStack.split(',').slice(0, 5).join(', ') : 'the technologies mentioned in the job description'}

Job Description:
${jobDescription}

${questionFocus}

Please provide:
1. A structured study plan organized by topics/skills mentioned in the job description - be specific to the technologies and frameworks mentioned
2. Interview questions organized by interview stage (if stages are mentioned) or by topic area
3. For each topic, include up-to-date information and best practices (as of 2025)
4. Make the study plan actionable with specific areas to focus on - prioritize what's most important for THIS specific role
5. For interview questions, provide IN-DEPTH, detailed answers with explanations, examples, and edge cases
6. Include REAL, WORKING URLs to high-quality learning resources (official documentation, tutorials, courses, articles)
7. Answers should be comprehensive enough to help someone actually prepare, not just brief tips
8. Questions should be realistic and similar to what they would actually face in interviews for this specific role
9. Think deeply about what makes a good candidate for THIS role - what would you want to test?
10. Include both technical depth questions and practical problem-solving scenarios

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
        "stageName": "Stage name (e.g., Technical Round, Behavioral Round)",
        "questions": [
          {
            "question": "Question text",
            "category": "Category (e.g., Technical, Behavioral)",
            "answer": "Comprehensive, in-depth answer explaining the concept thoroughly with examples and context",
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
      max_tokens: 3000, // Reduced from 4000 to save costs while maintaining quality
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
      await saveStudyPlan(jobHash, parsedResponse);
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
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache first for logo, role title, and company name
    let cachedUrlData = await getCachedJobUrl(url);
    let cachedLogo = cachedUrlData?.logo_url;
    let cachedRoleTitle = cachedUrlData?.role_title;
    let cachedCompanyName = cachedUrlData?.company_name;

    // If we have cached data but no logo, try to fetch logo again
    let shouldRefetchLogo = false;
    if (cachedUrlData && !cachedLogo) {
      console.log('📋 JD already parsed but logo missing - will attempt to fetch logo');
      shouldRefetchLogo = true;
    }

    // Scrape the job description
    const { jobDescription, logo: jobLogo, companyWebsite, linkedinCompanyUrl } = await scrapeJobDescription(url);

    if (!jobDescription || jobDescription.length < 100) {
      return res.status(400).json({ error: 'Could not extract meaningful content from the URL' });
    }

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

    // First, try to extract company name using OpenAI (more reliable than regex)
    let companyName = cachedCompanyName || null;
    try {
      const openai = getOpenAIClient();
      const namePrompt = `Extract the company name from this job description. Return ONLY the company name, nothing else. If you cannot find a clear company name, return "UNKNOWN".

Job Description:
${jobDescription.substring(0, 2000)}

Company name:`;

      const nameCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Use cheaper model for simple extraction
        messages: [
          {
            role: "system",
            content: "You are a text extraction tool. Extract only the company name from job descriptions. Return just the company name, nothing else."
          },
          {
            role: "user",
            content: namePrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 50,
      });

      const extractedName = nameCompletion.choices[0].message.content.trim();
      if (extractedName && extractedName !== "UNKNOWN" && extractedName.length > 2) {
        companyName = extractedName.replace(/^["']|["']$/g, ''); // Remove quotes if present
        console.log('Extracted company name using OpenAI:', companyName);
      }
    } catch (error) {
      console.log('OpenAI name extraction failed, using fallback:', error.message);
    }

    // Fallback to regex extraction if OpenAI didn't work
    if (!companyName) {
      companyName = extractCompanyName(jobDescription, url);
      console.log('Extracted company name using regex:', companyName);
    }
    
    // Now try logo.dev with extracted company name if we still don't have a logo
    if (!finalLogo && companyName && !companyWebsite) {
      try {
        // Try to construct domain from company name (e.g., "Keyrock" -> "keyrock.com")
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
            // Try next domain
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
      await saveJobUrlCache(url, finalLogo, cachedRoleTitle, cachedCompanyName);
    }

    // Extract role title from job description (use cache if available)
    let roleTitle = cachedRoleTitle || null;
    if (!roleTitle) {
      try {
        const openai = getOpenAIClient();
        const rolePrompt = `Extract the job title/role title from this job description. Return ONLY the job title (e.g., "Senior Software Engineer", "Product Manager", "Frontend Developer"), nothing else. If you cannot find a clear job title, return "UNKNOWN".

Job Description:
${jobDescription.substring(0, 2000)}

Job title:`;

        const roleCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini", // Use cheaper model for simple extraction
          messages: [
            {
              role: "system",
              content: "You are a text extraction tool. Extract only the job title from job descriptions. Return just the job title, nothing else."
            },
            {
              role: "user",
              content: rolePrompt
            }
          ],
          temperature: 0.1,
          max_tokens: 50,
        });

        const extractedRole = roleCompletion.choices[0].message.content.trim();
        if (extractedRole && extractedRole !== "UNKNOWN" && extractedRole.length > 2) {
          roleTitle = extractedRole.replace(/^["']|["']$/g, ''); // Remove quotes if present
          console.log('Extracted role title using OpenAI:', roleTitle);
        }
      } catch (error) {
        console.log('OpenAI role extraction failed, using fallback:', error.message);
        // Fallback: try to extract from common patterns
        const rolePatterns = [
          /(?:position|role|job|hiring|seeking|looking for)[:\s]+([A-Z][a-zA-Z\s&]+(?:Engineer|Developer|Manager|Designer|Analyst|Specialist|Lead|Director|Architect))/i,
          /(?:we are|we're|are) (?:hiring|seeking|looking for) (?:a |an )?([A-Z][a-zA-Z\s&]+(?:Engineer|Developer|Manager|Designer|Analyst|Specialist|Lead|Director|Architect))/i,
          /^([A-Z][a-zA-Z\s&]+(?:Engineer|Developer|Manager|Designer|Analyst|Specialist|Lead|Director|Architect))/m
        ];
        
        for (const pattern of rolePatterns) {
          const match = jobDescription.match(pattern);
          if (match && match[1]) {
            roleTitle = match[1].trim();
            console.log('Extracted role title using regex:', roleTitle);
            break;
          }
        }
      }
    }

    // Save to cache for future requests (saves API calls)
    if (companyName || roleTitle || finalLogo) {
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
    
    console.log('Final companyInfo being sent:', {
      name: companyInfo.name,
      hasLogo: !!companyInfo.logo,
      hasFounded: !!companyInfo.founded,
      hasDescription: !!companyInfo.description,
      fundingRoundsCount: companyInfo.fundingRounds?.length || 0
    });

    // Generate study plan and questions (requires auth and credits)
    // Check credits for study plan (user is authenticated)
    let studyPlan = null;
    const creditCheck = await checkCredits(user.id, CREDIT_COSTS.studyPlan);
    if (!creditCheck.hasCredits) {
      studyPlan = {
        requiresUpgrade: true,
        message: 'Insufficient credits. Upgrade to continue.'
      };
    } else {
      const companyNameForPlan = (companyInfo && companyInfo.name) ? companyInfo.name : 'the company';
      studyPlan = await generateStudyPlan(jobDescription, companyNameForPlan);
      await deductCredits(user.id, CREDIT_COSTS.studyPlan);
    }

    // Track this job analysis
    const jobDescriptionHash = hashJobDescription(jobDescription);
    await trackJobAnalysis(
      user.id,
      url,
      jobDescriptionHash,
      companyInfo.name,
      companyInfo.roleTitle
    );

    // Refresh user to get updated credits after deduction
    const updatedUser = await getUserFromSession(req.headers.authorization?.replace('Bearer ', ''));
    
    // Log what we're sending
    console.log('=== SENDING RESPONSE ===');
    console.log('companyInfo exists:', !!companyInfo);
    console.log('companyInfo.name:', companyInfo?.name);
    console.log('companyInfo.fundingRounds:', companyInfo?.fundingRounds?.length || 0);
    console.log('Full companyInfo:', JSON.stringify(companyInfo, null, 2));

    const response = {
      success: true,
      jobDescription: jobDescription,
      jobDescriptionHash: jobDescriptionHash, // Add hash for generate more questions feature
      companyInfo: companyInfo,
      studyPlan,
      url: url, // Include URL for reference
      user: {
        creditsRemaining: updatedUser?.creditsRemaining || user.creditsRemaining,
        plan: updatedUser?.plan || user.plan
      }
    };
    
    console.log('Response keys:', Object.keys(response));
    console.log('Response has companyInfo:', 'companyInfo' in response);
    
    res.json(response);
  } catch (error) {
    console.error('Error in /api/analyze:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// API endpoint to evaluate quiz answers
app.post('/api/quiz/evaluate', requireAuth, requireCredits(CREDIT_COSTS.quizEvaluation), async (req, res) => {
  try {
    const { question, userAnswer, correctAnswer, jobDescription } = req.body;

    if (!question || !userAnswer) {
      return res.status(400).json({ error: 'Question and user answer are required' });
    }

    // Deduct credits before processing
    await deductCredits(req.user.id, CREDIT_COSTS.quizEvaluation);

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

    // Persist attempt and award XP
    let gamificationData = {};
    try {
      gamificationData = await recordAttemptAndAwardXp(req.user.id, {
        jobDescriptionHash: req.body.jobDescriptionHash || '',
        sessionId: req.body.sessionId || null,
        questionText: question,
        questionCategory: req.body.questionCategory || null,
        attemptType: 'quiz',
        userAnswer: userAnswer,
        score: evaluation.score || 0,
        evaluation: evaluation,
      });
    } catch (xpError) {
      console.error('Error recording attempt/XP (non-critical):', xpError.message);
    }

    res.json({ success: true, evaluation, ...gamificationData });
  } catch (error) {
    console.error('Error in /api/quiz/evaluate:', error);
    res.status(500).json({ error: error.message || 'Failed to evaluate answer' });
  }
});

// API endpoint to evaluate voice recordings (transcribe and evaluate)
app.post('/api/voice/evaluate', requireAuth, requireCredits(CREDIT_COSTS.voiceEvaluation), async (req, res) => {
  let tempFilePath = null;
  try {
    const { audioBase64, question, jobDescription } = req.body;

    if (!audioBase64 || !question) {
      return res.status(400).json({ error: 'Audio and question are required' });
    }

    // Deduct credits before processing
    await deductCredits(req.user.id, CREDIT_COSTS.voiceEvaluation);

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

    // Persist attempt and award XP
    let gamificationData = {};
    try {
      gamificationData = await recordAttemptAndAwardXp(req.user.id, {
        jobDescriptionHash: req.body.jobDescriptionHash || '',
        sessionId: req.body.sessionId || null,
        questionText: question,
        questionCategory: req.body.questionCategory || null,
        attemptType: 'voice',
        userAnswer: transcribedText,
        score: evaluation.score || 0,
        evaluation: evaluation,
      });
    } catch (xpError) {
      console.error('Error recording voice attempt/XP (non-critical):', xpError.message);
    }

    res.json({
      success: true,
      transcription: transcribedText,
      evaluation,
      ...gamificationData
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

app.post('/api/company/research', async (req, res) => {
  // Check if user is authenticated (optional for preview mode)
  const sessionToken = req.headers.authorization?.replace('Bearer ', '');
  const user = sessionToken ? await getUserFromSession(sessionToken) : null;
  
  // Only require auth and credits if user is logged in
  if (user) {
    const creditCheck = await checkCredits(user.id, CREDIT_COSTS.companyResearch);
    if (!creditCheck.hasCredits) {
      return res.status(403).json({ error: 'Insufficient credits. Upgrade to continue.' });
    }
  }
  console.log('\n🟢 ✅ === COMPANY RESEARCH ENDPOINT HIT ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('URL:', req.url);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('==========================================\n');
  
  try {
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
    
    // Deduct credits after successful research (only if user is logged in)
    if (user) {
      await deductCredits(user.id, CREDIT_COSTS.companyResearch);
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
    const { plan } = req.body;
    
    if (!PLANS[plan] || !PLANS[plan].price) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    
    const successUrl = `${req.headers.origin || 'http://localhost:5000'}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${req.headers.origin || 'http://localhost:5000'}/billing/cancel`;
    
    const session = await createCheckoutSession(req.user.id, plan, successUrl, cancelUrl);
    
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
            name: 'Interview Prepper Advertiser Spot',
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
app.post('/api/questions/generate-more', requireAuth, requireCredits(CREDIT_COSTS.studyPlan), async (req, res) => {
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

Generate 10-15 NEW questions that are unique and haven't been asked before.
Format as JSON array of question objects:
[
  {
    "question": "Question text",
    "category": "Technical|Behavioral|System Design",
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

    // Deduct credits
    await deductCredits(req.user.id, CREDIT_COSTS.studyPlan);

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
    const { creditsRemaining, creditsMonthlyAllowance } = req.user;
    res.json({ 
      remaining: creditsRemaining,
      monthlyAllowance: creditsMonthlyAllowance,
      plan: req.user.plan
    });
  } catch (error) {
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
      
      // Update subscription to have unlimited credits
      await pool.query(
        `UPDATE subscriptions 
         SET credits_remaining = 999999, 
             credits_monthly_allowance = 999999,
             plan = 'elite'
         WHERE user_id = $1`,
        [userId]
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
    
    // Create subscription with unlimited credits
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, credits_remaining, credits_monthly_allowance, credits_reset_at)
       VALUES ($1, 'elite', 999999, 999999, CURRENT_TIMESTAMP + INTERVAL '365 days')`,
      [newUser.id]
    );
    
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
      return res.status(404).json({ error: 'Study plan not found' });
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
    // Ensure columns exist before querying
    await ensureAdvertiserColumns();
    
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

// Mount gamification routes
app.use(gamificationRouter);

// IMPORTANT: All API routes must be defined BEFORE this line
// Serve static files from the React app (AFTER all API routes)
app.use(express.static(path.join(__dirname, '../client/dist')));

// The "catchall" handler: for any request that doesn't match an API route, send back React's index.html file.
// IMPORTANT: This must be LAST, after all API routes and static files
app.get('*', (req, res) => {
  // Don't serve index.html for API routes (only GET requests reach here, POST should be handled above)
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

// Ensure database columns exist before starting server
ensureAdvertiserColumns().catch(err => {
  console.error('⚠️  Warning: Could not ensure advertiser columns:', err.message);
});

ensureJobAnalysesTable().catch(err => {
  console.error('⚠️  Warning: Could not ensure job_analyses table:', err.message);
});

ensureEmailVerificationCodesTable().catch(err => {
  console.error('⚠️  Warning: Could not ensure email_verification_codes table:', err.message);
});

// Ensure gamification tables exist
(async () => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS user_progress (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_description_hash VARCHAR(64) NOT NULL, topics_studied TEXT[] DEFAULT '{}',
      topics_completed TEXT[] DEFAULT '{}', confidence_scores JSONB DEFAULT '{}',
      flashcard_progress JSONB DEFAULT '{}', last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, job_description_hash)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS practice_sessions (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_description_hash VARCHAR(64) NOT NULL, started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP, mode VARCHAR(20) DEFAULT 'quiz', questions_attempted INTEGER DEFAULT 0,
      questions_correct INTEGER DEFAULT 0, average_score NUMERIC(5,2) DEFAULT 0,
      total_xp_earned INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS question_attempts (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_description_hash VARCHAR(64) NOT NULL, session_id INTEGER,
      question_text TEXT NOT NULL, question_category VARCHAR(100),
      attempt_type VARCHAR(20) NOT NULL DEFAULT 'quiz', user_answer TEXT,
      score INTEGER CHECK (score >= 0 AND score <= 100), evaluation JSONB,
      xp_earned INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_streaks (
      id SERIAL PRIMARY KEY, user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      current_streak INTEGER DEFAULT 0, longest_streak INTEGER DEFAULT 0,
      last_practice_date DATE, streak_multiplier NUMERIC(3,2) DEFAULT 1.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_achievements (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id VARCHAR(50) NOT NULL, unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, achievement_id)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_xp_log (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      xp_amount INTEGER NOT NULL, source VARCHAR(50) NOT NULL, source_id INTEGER,
      description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS current_level INTEGER DEFAULT 1');
    console.log('✅ Gamification tables ensured');
  } catch (err) {
    console.error('⚠️  Warning: Could not ensure gamification tables:', err.message);
  }
})();

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

