import pg from 'pg';
import { createHash } from 'crypto';

const { Pool } = pg;

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'interview_prepper',
  user: process.env.DB_USER || process.env.USER || 'postgres', // Use system user as fallback on macOS
  password: process.env.DB_PASSWORD || '',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

// Helper to normalize company name
function normalizeCompanyName(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '-');
}

// Helper to create hash of job description
function hashJobDescription(jobDescription) {
  return createHash('sha256').update(jobDescription).digest('hex');
}

// Get or create company by name
async function getOrCreateCompany(companyData) {
  const normalizedName = normalizeCompanyName(companyData.name);
  
  try {
    // Try to get existing company
    const existing = await pool.query(
      'SELECT * FROM companies WHERE normalized_name = $1',
      [normalizedName]
    );
    
    if (existing.rows.length > 0) {
      return existing.rows[0];
    }
    
    // Create new company
    const result = await pool.query(
      `INSERT INTO companies (name, normalized_name, founded, description, logo_url, company_website, linkedin_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        companyData.name,
        normalizedName,
        companyData.founded || null,
        companyData.description || null,
        companyData.logoUrl || companyData.logo || null,
        companyData.companyWebsite || null,
        companyData.linkedinCompanyUrl || null
      ]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error in getOrCreateCompany:', error.message);
    throw error;
  }
}

// Get company with all related data
async function getCompanyFullData(companyName) {
  const normalizedName = normalizeCompanyName(companyName);

  try {
    let company = await pool.query(
      'SELECT * FROM companies WHERE normalized_name = $1',
      [normalizedName]
    );

    // Fuzzy fallback: try LIKE match if exact match fails (handles "Datadog, Inc." vs "Datadog")
    if (company.rows.length === 0) {
      const baseName = normalizedName.replace(/-+(inc|llc|ltd|corp|co)-*$/i, '').replace(/-+$/, '');
      if (baseName !== normalizedName) {
        company = await pool.query(
          'SELECT * FROM companies WHERE normalized_name = $1',
          [baseName]
        );
      }
    }

    if (company.rows.length === 0) {
      return null;
    }
    
    const companyId = company.rows[0].id;
    
    // Get founders
    const founders = await pool.query(
      'SELECT * FROM company_founders WHERE company_id = $1',
      [companyId]
    );
    
    // Get funding rounds
    const fundingRounds = await pool.query(
      'SELECT * FROM company_funding_rounds WHERE company_id = $1 ORDER BY year DESC NULLS LAST, month DESC',
      [companyId]
    );
    
    // Get research (if not expired)
    const research = await pool.query(
      'SELECT * FROM company_research WHERE company_id = $1 AND expires_at > NOW()',
      [companyId]
    );
    
    return {
      ...company.rows[0],
      founders: founders.rows.map(f => ({
        name: f.name,
        linkedin: f.linkedin_url,
        background: f.background
      })),
      fundingRounds: fundingRounds.rows.map(r => ({
        year: r.year,
        month: r.month,
        type: r.type,
        amount: r.amount,
        leadInvestors: r.lead_investors,
        description: r.description,
        source: r.source
      })),
      research: research.rows.length > 0 ? {
        recentNews: research.rows[0].recent_news,
        culture: research.rows[0].culture,
        techStack: research.rows[0].tech_stack,
        teamSize: research.rows[0].team_size,
        achievements: research.rows[0].achievements,
        uniqueAspects: research.rows[0].unique_aspects,
        interviewTips: research.rows[0].interview_tips,
        values: research.rows[0].values
      } : null
    };
  } catch (error) {
    console.error('Error in getCompanyFullData:', error.message);
    return null;
  }
}

// Save company info
async function saveCompanyInfo(companyData) {
  try {
    const company = await getOrCreateCompany(companyData);
    const companyId = company.id;
    
    // Update company if new data provided
    if (companyData.founded || companyData.description) {
      await pool.query(
        `UPDATE companies 
         SET founded = COALESCE($1, founded),
             description = COALESCE($2, description),
             logo_url = COALESCE($3, logo_url),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [
          companyData.founded || null,
          companyData.description || null,
          companyData.logoUrl || companyData.logo || null,
          companyId
        ]
      );
    }
    
    // Save founders
    if (companyData.founders && Array.isArray(companyData.founders)) {
      // Delete existing founders
      await pool.query('DELETE FROM company_founders WHERE company_id = $1', [companyId]);
      
      // Insert new founders
      for (const founder of companyData.founders) {
        await pool.query(
          `INSERT INTO company_founders (company_id, name, linkedin_url, background)
           VALUES ($1, $2, $3, $4)`,
          [companyId, founder.name, founder.linkedin || null, founder.background || null]
        );
      }
    }
    
    // Save funding rounds
    if (companyData.fundingRounds && Array.isArray(companyData.fundingRounds)) {
      for (const round of companyData.fundingRounds) {
        // Check if round already exists
        const existing = await pool.query(
          `SELECT id FROM company_funding_rounds 
           WHERE company_id = $1 AND year = $2 AND type = $3 AND amount = $4`,
          [companyId, round.year, round.type, round.amount]
        );
        
        if (existing.rows.length === 0) {
          await pool.query(
            `INSERT INTO company_funding_rounds 
             (company_id, year, month, type, amount, lead_investors, description, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              companyId,
              round.year || null,
              round.month || null,
              round.type || null,
              round.amount || null,
              round.leadInvestors || null,
              round.description || null,
              round.source || 'openai'
            ]
          );
        }
      }
    }
    
    return company;
  } catch (error) {
    console.error('Error in saveCompanyInfo:', error.message);
    throw error;
  }
}

// Save company research
async function saveCompanyResearch(companyName, research) {
  try {
    const company = await getOrCreateCompany({ name: companyName });
    const companyId = company.id;
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days TTL
    
    await pool.query(
      `INSERT INTO company_research 
       (company_id, recent_news, culture, tech_stack, team_size, achievements, 
        unique_aspects, interview_tips, values, cached_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10)
       ON CONFLICT (company_id) 
       DO UPDATE SET
         recent_news = EXCLUDED.recent_news,
         culture = EXCLUDED.culture,
         tech_stack = EXCLUDED.tech_stack,
         team_size = EXCLUDED.team_size,
         achievements = EXCLUDED.achievements,
         unique_aspects = EXCLUDED.unique_aspects,
         interview_tips = EXCLUDED.interview_tips,
         values = EXCLUDED.values,
         cached_at = CURRENT_TIMESTAMP,
         expires_at = EXCLUDED.expires_at`,
      [
        companyId,
        JSON.stringify(research.recentNews || []),
        research.culture || null,
        research.techStack || [],
        research.teamSize || null,
        JSON.stringify(research.achievements || []),
        JSON.stringify(research.uniqueAspects || []),
        JSON.stringify(research.interviewTips || []),
        JSON.stringify(research.values || []),
        expiresAt
      ]
    );
    
    console.log(`✅ Cached company research for: ${companyName}`);
  } catch (error) {
    console.error('Error in saveCompanyResearch:', error.message);
    throw error;
  }
}

// Get all active advertisers
async function getActiveAdvertisers() {
  try {
    const result = await pool.query(
      'SELECT id, name, domain, description, logo_url, website_url, COALESCE(job_count, 0) as job_count, is_actively_hiring, is_active, display_order, created_at, updated_at FROM advertisers WHERE is_active = true ORDER BY display_order, name',
      []
    );
    // Log to debug
    console.log('📋 getActiveAdvertisers returned:', result.rows.length, 'advertisers');
    result.rows.forEach(ad => {
      console.log(`  - ${ad.name}: job_count=${ad.job_count} (type: ${typeof ad.job_count}), domain=${ad.domain}, logo_url=${ad.logo_url ? 'EXISTS' : 'NULL'}`);
    });
    return result.rows;
  } catch (error) {
    console.error('Error in getActiveAdvertisers:', error.message);
    return [];
  }
}

// Get or create advertiser and cache logo
async function getOrCreateAdvertiser(name, domain, description, websiteUrl, jobCount = 0, isActivelyHiring = false) {
  try {
    // Check if exists
    const existing = await pool.query(
      'SELECT * FROM advertisers WHERE domain = $1',
      [domain]
    );
    
    if (existing.rows.length > 0) {
      // ALWAYS update job count and hiring status when provided (even if 0 or false)
      if (jobCount !== undefined || isActivelyHiring !== undefined) {
        const finalJobCount = jobCount !== undefined ? jobCount : existing.rows[0].job_count
        const finalHiring = isActivelyHiring !== undefined ? isActivelyHiring : existing.rows[0].is_actively_hiring
        
        const updateResult = await pool.query(
          `UPDATE advertisers 
           SET job_count = $1,
               is_actively_hiring = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE domain = $3
           RETURNING *`,
          [finalJobCount, finalHiring, domain]
        );
        if (updateResult.rows.length > 0) {
          console.log(`✅ DB Updated ${name}: job_count=${updateResult.rows[0].job_count}, hiring=${updateResult.rows[0].is_actively_hiring}`);
          return updateResult.rows[0];
        }
      }
      return existing.rows[0];
    }
    
    // Create new advertiser (logo_url will be fetched and cached separately)
    const result = await pool.query(
      `INSERT INTO advertisers (name, domain, description, website_url, job_count, is_actively_hiring)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, domain, description || null, websiteUrl || null, jobCount, isActivelyHiring]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error in getOrCreateAdvertiser:', error.message);
    throw error;
  }
}

// Update advertiser logo URL
async function updateAdvertiserLogo(domain, logoUrl) {
  try {
    await pool.query(
      'UPDATE advertisers SET logo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE domain = $2',
      [logoUrl, domain]
    );
  } catch (error) {
    console.error('Error in updateAdvertiserLogo:', error.message);
  }
}

// Update advertiser job count
async function updateAdvertiserJobCount(domain, jobCount, isActivelyHiring = false) {
  try {
    await pool.query(
      'UPDATE advertisers SET job_count = $1, is_actively_hiring = $2, last_job_count_update = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE domain = $3',
      [jobCount, isActivelyHiring, domain]
    );
  } catch (error) {
    console.error('Error in updateAdvertiserJobCount:', error.message);
  }
}

// Scrape job count from careers page
async function scrapeJobCountFromCareersPage(websiteUrl, domain) {
  if (!websiteUrl) return null;
  
  try {
    const axios = (await import('axios')).default;
    const cheerio = (await import('cheerio')).default;
    
    console.log(`🔍 Scraping job count from: ${websiteUrl}`);
    
    // Get or create HTTPS agent (shared with main server)
    let httpsAgent;
    try {
      const https = await import('https');
      httpsAgent = new https.Agent({
        rejectUnauthorized: false // Accept self-signed certificates
      });
    } catch (e) {
      console.error('Error creating HTTPS agent:', e);
    }
    
    const response = await axios.get(websiteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      ...(httpsAgent && { httpsAgent: httpsAgent }),
      timeout: 10000,
      maxRedirects: 5
    });
    
    const $ = cheerio.load(response.data);
    const pageText = $('body').text();
    
    // Common patterns for job counts
    const patterns = [
      // "X open positions", "X jobs", "X openings"
      /(\d+)\s+(?:open\s+)?(?:positions?|jobs?|openings?|roles?|opportunities?)/i,
      // "We're hiring for X roles"
      /(?:hiring|have)\s+(?:for\s+)?(\d+)\s+(?:positions?|jobs?|roles?|openings?)/i,
      // "X+ positions available"
      /(\d+)\+?\s+(?:positions?|jobs?|roles?|openings?)\s+(?:available|open)/i,
      // Greenhouse/Lever style: "X Jobs"
      /(\d+)\s+Jobs/i,
      // Number followed by job-related keywords
      /(\d{1,4})\s*(?:positions?|jobs?|openings?|roles?)/i
    ];
    
    let jobCount = null;
    for (const pattern of patterns) {
      const matches = pageText.match(pattern);
      if (matches && matches[1]) {
        const count = parseInt(matches[1], 10);
        // Sanity check: reasonable job count (1-1000)
        if (count > 0 && count <= 1000) {
          jobCount = count;
          console.log(`✅ Found job count for ${domain}: ${jobCount}`);
          break;
        }
      }
    }
    
    // Also check for structured data or meta tags
    if (!jobCount) {
      // Check for JSON-LD structured data
      $('script[type="application/ld+json"]').each((i, elem) => {
        try {
          const jsonData = JSON.parse($(elem).html());
          if (jsonData.numberOfEmployees || jsonData.jobPosting) {
            // Could extract from structured data if available
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      });
      
      // Check for common class names that might contain job counts
      const jobCountSelectors = [
        '[class*="job-count"]',
        '[class*="open-positions"]',
        '[class*="number-of-jobs"]',
        '[id*="job-count"]',
        '[id*="open-positions"]'
      ];
      
      for (const selector of jobCountSelectors) {
        const element = $(selector).first();
        if (element.length) {
          const text = element.text();
          const match = text.match(/(\d{1,4})/);
          if (match) {
            const count = parseInt(match[1], 10);
            if (count > 0 && count <= 1000) {
              jobCount = count;
              console.log(`✅ Found job count in selector for ${domain}: ${jobCount}`);
              break;
            }
          }
        }
      }
    }
    
    // Determine if actively hiring (if we found jobs or if page has hiring indicators)
    const isActivelyHiring = jobCount ? jobCount > 0 : (
      pageText.toLowerCase().includes('hiring') || 
      pageText.toLowerCase().includes('we\'re hiring') ||
      pageText.toLowerCase().includes('join us') ||
      $('[class*="hiring"]').length > 0 ||
      $('[class*="careers"]').length > 0
    );
    
    return { jobCount, isActivelyHiring };
  } catch (error) {
    console.log(`⚠️ Could not scrape job count from ${websiteUrl}:`, error.message);
    return null;
  }
}

// Ensure advertiser table has required columns (runs on startup)
async function ensureAdvertiserColumns() {
  try {
    // Check if job_count column exists
    const checkJobCount = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='advertisers' AND column_name='job_count'
    `);
    
    if (checkJobCount.rows.length === 0) {
      console.log('📦 Adding job_count column to advertisers table...');
      await pool.query('ALTER TABLE advertisers ADD COLUMN job_count INTEGER DEFAULT 0');
    }
    
    // Check if is_actively_hiring column exists
    const checkHiring = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='advertisers' AND column_name='is_actively_hiring'
    `);
    
    if (checkHiring.rows.length === 0) {
      console.log('📦 Adding is_actively_hiring column to advertisers table...');
      await pool.query('ALTER TABLE advertisers ADD COLUMN is_actively_hiring BOOLEAN DEFAULT false');
    }
    
    // Check if last_job_count_update column exists
    const checkUpdate = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='advertisers' AND column_name='last_job_count_update'
    `);
    
    if (checkUpdate.rows.length === 0) {
      console.log('📦 Adding last_job_count_update column to advertisers table...');
      await pool.query('ALTER TABLE advertisers ADD COLUMN last_job_count_update TIMESTAMP');
    }
    
    console.log('✅ Advertiser table columns verified');
  } catch (error) {
    // If table doesn't exist, that's okay - it will be created by migrations
    if (error.code !== '42P01') {
      console.error('Error ensuring advertiser columns:', error.message);
    }
  }
}

// Get cached study plan by job description hash
async function getCachedStudyPlan(jobDescriptionHash) {
  try {
    const result = await pool.query(
      'SELECT study_plan FROM study_plans WHERE job_description_hash = $1',
      [jobDescriptionHash]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].study_plan;
    }
    
    return null;
  } catch (error) {
    console.error('Error in getCachedStudyPlan:', error.message);
    return null;
  }
}

// Save study plan by job description hash (with optional company/role for cross-user matching)
async function saveStudyPlan(jobDescriptionHash, studyPlan, companyName = null, roleTitle = null) {
  try {
    // Ensure company_name and role_title columns exist (idempotent)
    await pool.query(`
      ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS role_title VARCHAR(255)
    `).catch(() => {
      // Try individually if combined fails
      pool.query('ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)').catch(() => {});
      pool.query('ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS role_title VARCHAR(255)').catch(() => {});
    });

    await pool.query(
      `INSERT INTO study_plans (job_description_hash, study_plan, company_name, role_title, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (job_description_hash)
       DO UPDATE SET study_plan = EXCLUDED.study_plan,
                     company_name = COALESCE(EXCLUDED.company_name, study_plans.company_name),
                     role_title = COALESCE(EXCLUDED.role_title, study_plans.role_title),
                     created_at = CURRENT_TIMESTAMP`,
      [jobDescriptionHash, JSON.stringify(studyPlan), companyName || null, roleTitle || null]
    );

    console.log(`✅ Cached study plan (hash: ${jobDescriptionHash.substring(0, 8)}...) ${companyName || ''} ${roleTitle || ''}`);
  } catch (error) {
    console.error('Error in saveStudyPlan:', error.message);
    // Don't throw - caching failure shouldn't break the app
  }
}

// Find a study plan from another user who analyzed the same company+role
async function findStudyPlanByCompanyRole(companyName, roleTitle) {
  if (!companyName || !roleTitle) return null;
  try {
    // Normalize: lowercase, trim whitespace
    const normCompany = companyName.trim().toLowerCase();
    const normRole = roleTitle.trim().toLowerCase();

    const result = await pool.query(
      `SELECT study_plan, job_description_hash FROM study_plans
       WHERE LOWER(TRIM(company_name)) = $1
         AND LOWER(TRIM(role_title)) = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [normCompany, normRole]
    );

    if (result.rows.length > 0) {
      return {
        studyPlan: result.rows[0].study_plan,
        sourceHash: result.rows[0].job_description_hash,
      };
    }
    return null;
  } catch (error) {
    console.error('Error in findStudyPlanByCompanyRole:', error.message);
    return null;
  }
}

// Get cached job URL data (logo, role title, company name)
async function getCachedJobUrl(url) {
  try {
    const result = await pool.query(
      'SELECT logo_url, role_title, company_name FROM job_url_cache WHERE url = $1',
      [url]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    return null;
  } catch (error) {
    console.error('Error in getCachedJobUrl:', error.message);
    return null;
  }
}

// Save job URL cache (logo, role title, company name)
async function saveJobUrlCache(url, logoUrl, roleTitle, companyName) {
  try {
    await pool.query(
      `INSERT INTO job_url_cache (url, logo_url, role_title, company_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (url) 
       DO UPDATE SET 
         logo_url = COALESCE(EXCLUDED.logo_url, job_url_cache.logo_url),
         role_title = COALESCE(EXCLUDED.role_title, job_url_cache.role_title),
         company_name = COALESCE(EXCLUDED.company_name, job_url_cache.company_name),
         updated_at = CURRENT_TIMESTAMP`,
      [url, logoUrl, roleTitle, companyName]
    );
    
    console.log(`✅ Cached job URL data for: ${url.substring(0, 50)}...`);
  } catch (error) {
    console.error('Error in saveJobUrlCache:', error.message);
    // Don't throw - caching failure shouldn't break the app
  }
}

// Track job analysis
async function trackJobAnalysis(userId, url, jobDescriptionHash, companyName, roleTitle) {
  try {
    const result = await pool.query(
      `INSERT INTO job_analyses (user_id, url, job_description_hash, company_name, role_title, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, url, jobDescriptionHash, companyName || null, roleTitle || null]
    );
    const analysisId = result.rows[0]?.id;
    console.log(`✅ Tracked job analysis: ${companyName || 'Unknown'} - ${roleTitle || 'No role'} (ID: ${analysisId})`);
    return analysisId;
  } catch (error) {
    console.error('❌ Error tracking job analysis:', error.message);
    console.error('Error details:', error);
    // Don't throw - tracking failure shouldn't break the app
    return null;
  }
}

// Get job analyses for a specific user
async function getUserJobAnalyses(userId, limit = 100, offset = 0) {
  try {
    const result = await pool.query(
      `SELECT ja.*, sp.created_at as study_plan_created_at, juc.logo_url
       FROM job_analyses ja
       LEFT JOIN study_plans sp ON ja.job_description_hash = sp.job_description_hash
       LEFT JOIN job_url_cache juc ON ja.url = juc.url
       WHERE ja.user_id = $1
       ORDER BY ja.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting user job analyses:', error.message);
    return [];
  }
}

// Get user stats
async function getUserStats(userId) {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM job_analyses WHERE user_id = $1) as total_analyses,
        (SELECT COUNT(DISTINCT job_description_hash) FROM job_analyses WHERE user_id = $1) as unique_study_plans,
        (SELECT COUNT(DISTINCT company_name) FROM job_analyses WHERE user_id = $1 AND company_name IS NOT NULL) as unique_companies
    `, [userId]);
    return stats.rows[0];
  } catch (error) {
    console.error('Error getting user stats:', error.message);
    return {
      total_analyses: 0,
      unique_study_plans: 0,
      unique_companies: 0
    };
  }
}

// Ensure job_analyses table exists
async function ensureJobAnalysesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_analyses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        job_description_hash VARCHAR(64) NOT NULL,
        company_name VARCHAR(255),
        role_title VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_job_analyses_user_id ON job_analyses(user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_job_analyses_created_at ON job_analyses(created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_job_analyses_hash ON job_analyses(job_description_hash)
    `);
    console.log('✅ job_analyses table ensured');
  } catch (error) {
    if (error.code !== '42P01') { // Table already exists
      console.error('❌ Error ensuring job_analyses table:', error.message);
      console.error('Error details:', error);
    } else {
      console.log('✅ job_analyses table already exists');
    }
  }
}

// Ensure email_verification_codes table exists
async function ensureEmailVerificationCodesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_verification_codes(email)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_codes_code ON email_verification_codes(code)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_codes_expires ON email_verification_codes(expires_at)
    `);
    console.log('✅ email_verification_codes table ensured');
  } catch (error) {
    if (error.code !== '42P01') { // Table already exists
      console.error('❌ Error ensuring email_verification_codes table:', error.message);
      console.error('Error details:', error);
    } else {
      console.log('✅ email_verification_codes table already exists');
    }
  }
}

// Normalize a topic name for deduplication
function normalizeTopicName(name, companyName = null) {
  let n = name.toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/['']/g, "'")
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim()

  // Normalize common variants
  n = n.replace(/\bfront[-\s]end\b/g, 'frontend')
    .replace(/\bback[-\s]end\b/g, 'backend')

  // Strip leading fluff prefixes
  n = n.replace(/^(advanced|introduction to|intro to|basic)\s+/, '')

  // Strip trailing fluff words
  const fluffWords = ['proficiency', 'skills', 'expertise', 'fundamentals', 'concepts', 'best practices', 'knowledge', 'essentials']
  for (const word of fluffWords) {
    n = n.replace(new RegExp(`\\s+${word}$`), '')
  }

  // Strip company name from topic if provided
  if (companyName) {
    const compLower = companyName.toLowerCase().trim()
    n = n.replace(new RegExp(`\\b${compLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), '').replace(/\s+/g, ' ').trim()
  }

  // Sort multi-part names for consistency ("sql and python" -> "python and sql")
  // Only sort simple parts (no parentheses or complex content)
  if (!/[()]/.test(n)) {
    const andParts = n.split(' and ')
    if (andParts.length > 1) {
      n = andParts.map(p => p.trim()).filter(Boolean).sort().join(' and ')
    } else {
      const commaParts = n.split(', ')
      if (commaParts.length > 1) {
        n = commaParts.map(p => p.trim()).filter(Boolean).sort().join(', ')
      }
    }
  }

  return n
}

// Get or create a topic, returning its id
async function getOrCreateTopic(name, category = null, description = null, { companyName = null, isDrillable = true } = {}) {
  const normalized = normalizeTopicName(name, companyName)
  try {
    const existing = await pool.query(
      'SELECT * FROM topics WHERE normalized_name = $1',
      [normalized]
    )
    if (existing.rows.length > 0) return existing.rows[0]

    const result = await pool.query(
      `INSERT INTO topics (name, normalized_name, category, description, is_drillable)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (normalized_name) DO UPDATE SET
         category = COALESCE(EXCLUDED.category, topics.category),
         description = COALESCE(EXCLUDED.description, topics.description),
         is_drillable = EXCLUDED.is_drillable
       RETURNING *`,
      [name, normalized, category, description, isDrillable]
    )
    return result.rows[0]
  } catch (error) {
    console.error('Error in getOrCreateTopic:', error.message)
    throw error
  }
}

// Link topics to a job by hash
async function linkTopicsToJob(jobDescriptionHash, topicIds) {
  try {
    for (const topicId of topicIds) {
      await pool.query(
        `INSERT INTO job_topics (job_description_hash, topic_id)
         VALUES ($1, $2)
         ON CONFLICT (job_description_hash, topic_id) DO NOTHING`,
        [jobDescriptionHash, topicId]
      )
    }
  } catch (error) {
    console.error('Error in linkTopicsToJob:', error.message)
  }
}

// Get all topic scores for a user
async function getUserTopicScores(userId) {
  try {
    const result = await pool.query(
      `SELECT uts.*, t.name as topic_name, t.normalized_name, t.category, t.description as topic_description
       FROM user_topic_scores uts
       JOIN topics t ON t.id = uts.topic_id
       WHERE uts.user_id = $1
       ORDER BY uts.updated_at DESC`,
      [userId]
    )
    return result.rows
  } catch (error) {
    console.error('Error in getUserTopicScores:', error.message)
    return []
  }
}

// Get ALL topics linked to any of the user's jobs, with scores when available
async function getAllUserTopics(userId) {
  try {
    const result = await pool.query(
      `SELECT t.id, t.name as topic_name, t.normalized_name, t.category, t.description as topic_description,
              COALESCE(uts.score, 0) as score,
              COALESCE(uts.attempts, 0) as attempts,
              COALESCE(uts.correct_count, 0) as correct_count,
              uts.last_practiced_at,
              uts.difficulty,
              COUNT(DISTINCT jt.job_description_hash) as job_count
       FROM topics t
       JOIN job_topics jt ON jt.topic_id = t.id
       JOIN job_analyses ja ON ja.job_description_hash = jt.job_description_hash
       LEFT JOIN user_topic_scores uts ON uts.topic_id = t.id AND uts.user_id = $1
       WHERE ja.user_id = $1 AND t.is_drillable = TRUE
       GROUP BY t.id, t.name, t.normalized_name, t.category, t.description, uts.score, uts.attempts, uts.correct_count, uts.last_practiced_at, uts.difficulty
       ORDER BY COALESCE(uts.attempts, 0) DESC, t.name`,
      [userId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error in getAllUserTopics:', error.message);
    return [];
  }
}

// Update a user's score on a topic
async function updateUserTopicScore(userId, topicId, score, isCorrect, difficulty) {
  try {
    await pool.query(
      `INSERT INTO user_topic_scores (user_id, topic_id, score, attempts, correct_count, difficulty, last_practiced_at, updated_at)
       VALUES ($1, $2, $3, 1, $4, COALESCE($5, 'mid'), NOW(), NOW())
       ON CONFLICT (user_id, topic_id) DO UPDATE SET
         score = (user_topic_scores.score * user_topic_scores.attempts + $3) / (user_topic_scores.attempts + 1),
         attempts = user_topic_scores.attempts + 1,
         correct_count = user_topic_scores.correct_count + $4,
         difficulty = COALESCE($5, user_topic_scores.difficulty),
         last_practiced_at = NOW(),
         updated_at = NOW()`,
      [userId, topicId, score, isCorrect ? 1 : 0, difficulty || null]
    )
  } catch (error) {
    console.error('Error in updateUserTopicScore:', error.message)
  }
}

// Get topics linked to a job
async function getTopicsForJob(jobDescriptionHash) {
  try {
    const result = await pool.query(
      `SELECT t.*, t.is_drillable, jt.relevance_score
       FROM topics t
       JOIN job_topics jt ON jt.topic_id = t.id
       WHERE jt.job_description_hash = $1
       ORDER BY jt.relevance_score DESC`,
      [jobDescriptionHash]
    )
    return result.rows
  } catch (error) {
    console.error('Error in getTopicsForJob:', error.message)
    return []
  }
}

// Get topics shared across multiple of a user's jobs
async function getSharedTopicsAcrossJobs(userId) {
  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.normalized_name, t.category,
              COUNT(DISTINCT jt.job_description_hash) as job_count,
              COALESCE(uts.score, 0) as user_score,
              COALESCE(uts.attempts, 0) as user_attempts
       FROM topics t
       JOIN job_topics jt ON jt.topic_id = t.id
       JOIN job_analyses ja ON ja.job_description_hash = jt.job_description_hash
       LEFT JOIN user_topic_scores uts ON uts.topic_id = t.id AND uts.user_id = $1
       WHERE ja.user_id = $1 AND t.is_drillable = TRUE
       GROUP BY t.id, t.name, t.normalized_name, t.category, uts.score, uts.attempts
       HAVING COUNT(DISTINCT jt.job_description_hash) > 1
       ORDER BY job_count DESC, t.name`,
      [userId]
    )
    return result.rows
  } catch (error) {
    console.error('Error in getSharedTopicsAcrossJobs:', error.message)
    return []
  }
}

// Create a new structured drill session
async function createDrillSession(userId, topicId, { difficulty, questionCount }) {
  try {
    const result = await pool.query(
      `INSERT INTO drill_sessions (user_id, topic_id, status, question_count, questions_answered, difficulty, started_at)
       VALUES ($1, $2, 'active', $3, 0, $4, NOW())
       RETURNING *`,
      [userId, topicId, questionCount, difficulty || 'mid']
    )
    return result.rows[0]
  } catch (error) {
    console.error('Error in createDrillSession:', error.message)
    throw error
  }
}

// Save an individual drill question
async function saveDrillQuestion(sessionId, { questionNumber, questionText, userAnswer, coachResponse, score, feedback }) {
  try {
    await pool.query(
      `INSERT INTO drill_questions (session_id, question_number, question_text, user_answer, coach_response, score, feedback)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (session_id, question_number) DO UPDATE SET
         user_answer = EXCLUDED.user_answer,
         coach_response = EXCLUDED.coach_response,
         score = EXCLUDED.score,
         feedback = EXCLUDED.feedback`,
      [sessionId, questionNumber, questionText, userAnswer, coachResponse, score, feedback]
    )
    await pool.query(
      `UPDATE drill_sessions SET questions_answered = $1 WHERE id = $2`,
      [questionNumber, sessionId]
    )
  } catch (error) {
    console.error('Error in saveDrillQuestion:', error.message)
  }
}

// Complete a drill session (compute scores from drill_questions)
async function completeDrillSession(sessionId) {
  try {
    const questionsResult = await pool.query(
      `SELECT score FROM drill_questions WHERE session_id = $1 ORDER BY question_number`,
      [sessionId]
    )
    const scores = questionsResult.rows.map(r => r.score).filter(s => s !== null)
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null

    await pool.query(
      `UPDATE drill_sessions SET status = 'completed', avg_score = $1, scores = $2, answers = questions_answered, completed_at = NOW() WHERE id = $3`,
      [avgScore, JSON.stringify(scores), sessionId]
    )
  } catch (error) {
    console.error('Error in completeDrillSession:', error.message)
  }
}

// Abandon a drill session (partial scores kept)
async function abandonDrillSession(sessionId) {
  try {
    const questionsResult = await pool.query(
      `SELECT score FROM drill_questions WHERE session_id = $1 ORDER BY question_number`,
      [sessionId]
    )
    const scores = questionsResult.rows.map(r => r.score).filter(s => s !== null)
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null

    await pool.query(
      `UPDATE drill_sessions SET status = 'abandoned', avg_score = $1, scores = $2, answers = questions_answered, completed_at = NOW() WHERE id = $3`,
      [avgScore, JSON.stringify(scores), sessionId]
    )
  } catch (error) {
    console.error('Error in abandonDrillSession:', error.message)
  }
}

// Get recent drill questions for deduplication (question memory)
async function getRecentDrillQuestions(userId, topicId, limit = 50) {
  try {
    const result = await pool.query(
      `SELECT dq.question_text FROM drill_questions dq
       JOIN drill_sessions ds ON dq.session_id = ds.id
       WHERE ds.user_id = $1 AND ds.topic_id = $2
       ORDER BY dq.created_at DESC LIMIT $3`,
      [userId, topicId, limit]
    )
    return result.rows.map(r => r.question_text)
  } catch (error) {
    console.error('Error in getRecentDrillQuestions:', error.message)
    return []
  }
}

// Get active drill session for a user+topic (prevents duplicates)
async function getActiveDrillSession(userId, topicId) {
  try {
    const result = await pool.query(
      `SELECT * FROM drill_sessions WHERE user_id = $1 AND topic_id = $2 AND status = 'active' LIMIT 1`,
      [userId, topicId]
    )
    return result.rows[0] || null
  } catch (error) {
    console.error('Error in getActiveDrillSession:', error.message)
    return null
  }
}

// Save a completed drill session (legacy)
async function saveDrillSession(userId, topicId, { answers, avgScore, scores, xpEarned, difficulty }) {
  try {
    const result = await pool.query(
      `INSERT INTO drill_sessions (user_id, topic_id, answers, avg_score, scores, xp_earned, difficulty)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, topicId, answers, avgScore, JSON.stringify(scores || []), xpEarned || 0, difficulty || 'mid']
    )
    return result.rows[0]
  } catch (error) {
    console.error('Error in saveDrillSession:', error.message)
    throw error
  }
}

// Get drill session history for a user's topic
async function getDrillSessions(userId, topicId) {
  try {
    const result = await pool.query(
      `SELECT * FROM drill_sessions
       WHERE user_id = $1 AND topic_id = $2
       ORDER BY completed_at DESC
       LIMIT 20`,
      [userId, topicId]
    )
    return result.rows
  } catch (error) {
    console.error('Error in getDrillSessions:', error.message)
    return []
  }
}

// Set difficulty level for a specific user topic
async function setUserTopicDifficulty(userId, topicId, difficulty) {
  try {
    await pool.query(
      `INSERT INTO user_topic_scores (user_id, topic_id, score, attempts, correct_count, difficulty, last_practiced_at, updated_at)
       VALUES ($1, $2, 0, 0, 0, $3, NULL, NOW())
       ON CONFLICT (user_id, topic_id) DO UPDATE SET
         difficulty = $3,
         updated_at = NOW()`,
      [userId, topicId, difficulty]
    );
  } catch (error) {
    console.error('Error in setUserTopicDifficulty:', error.message);
  }
}

// Get the most recent role title from a user's job analyses
async function getUserMostRecentRoleTitle(userId) {
  try {
    const result = await pool.query(
      `SELECT role_title FROM job_analyses
       WHERE user_id = $1 AND role_title IS NOT NULL AND role_title != ''
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0]?.role_title || null;
  } catch (error) {
    console.error('Error in getUserMostRecentRoleTitle:', error.message);
    return null;
  }
}

// Synonym map for fuzzy topic matching
const TOPIC_SYNONYMS = {
  'frontend': ['front-end', 'front end'],
  'backend': ['back-end', 'back end'],
  'javascript': ['js'],
  'typescript': ['ts'],
  'databases': ['db', 'database'],
  'devops': ['dev ops', 'dev-ops'],
  'ci/cd': ['cicd', 'ci cd'],
}

// Build reverse map for quick lookup
const SYNONYM_LOOKUP = new Map()
for (const [canonical, synonyms] of Object.entries(TOPIC_SYNONYMS)) {
  SYNONYM_LOOKUP.set(canonical, canonical)
  for (const syn of synonyms) {
    SYNONYM_LOOKUP.set(syn, canonical)
  }
}

function canonicalWord(word) {
  return SYNONYM_LOOKUP.get(word) || word
}

// Find a similar existing topic for a user using fuzzy matching
async function findSimilarUserTopic(normalizedName, userId) {
  const userTopics = await getAllUserTopics(userId)
  if (userTopics.length === 0) return null

  const newWords = new Set(normalizedName.split(/\s+/).map(canonicalWord).filter(w => w !== 'and'))

  let bestMatch = null
  let bestScore = 0

  for (const topic of userTopics) {
    const existingNorm = topic.normalized_name

    // Exact match (already handled by getOrCreateTopic, but just in case)
    if (existingNorm === normalizedName) return topic

    // Containment match (only when shorter string is >= 2 words)
    const shorter = normalizedName.length < existingNorm.length ? normalizedName : existingNorm
    const longer = normalizedName.length < existingNorm.length ? existingNorm : normalizedName
    if (shorter.split(/\s+/).length >= 2 && longer.includes(shorter)) {
      return topic
    }

    // Word overlap with synonym awareness (Jaccard)
    const existingWords = new Set(existingNorm.split(/\s+/).map(canonicalWord).filter(w => w !== 'and'))
    const intersection = [...newWords].filter(w => existingWords.has(w))
    const unionSize = new Set([...newWords, ...existingWords]).size
    const jaccard = unionSize > 0 ? intersection.length / unionSize : 0

    if (jaccard >= 0.6 && jaccard > bestScore) {
      bestScore = jaccard
      bestMatch = topic
    }
  }

  return bestMatch
}

// Get all drill sessions for a user (for the drills page overview)
async function getAllDrillSessions(userId) {
  try {
    const result = await pool.query(
      `SELECT ds.*, t.name as topic_name, t.normalized_name
       FROM drill_sessions ds
       JOIN topics t ON t.id = ds.topic_id
       WHERE ds.user_id = $1
       ORDER BY ds.completed_at DESC`,
      [userId]
    )
    return result.rows
  } catch (error) {
    console.error('Error in getAllDrillSessions:', error.message)
    return []
  }
}

export {
  pool,
  getOrCreateCompany,
  getCompanyFullData,
  saveCompanyInfo,
  saveCompanyResearch,
  normalizeCompanyName,
  hashJobDescription,
  getCachedStudyPlan,
  saveStudyPlan,
  getCachedJobUrl,
  saveJobUrlCache,
  getActiveAdvertisers,
  getOrCreateAdvertiser,
  updateAdvertiserLogo,
  updateAdvertiserJobCount,
  ensureAdvertiserColumns,
  scrapeJobCountFromCareersPage,
  trackJobAnalysis,
  getUserJobAnalyses,
  getUserStats,
  ensureJobAnalysesTable,
  ensureEmailVerificationCodesTable,
  findStudyPlanByCompanyRole,
  getOrCreateTopic,
  linkTopicsToJob,
  getUserTopicScores,
  updateUserTopicScore,
  getTopicsForJob,
  getSharedTopicsAcrossJobs,
  normalizeTopicName,
  getAllUserTopics,
  findSimilarUserTopic,
  createDrillSession,
  saveDrillQuestion,
  completeDrillSession,
  abandonDrillSession,
  getRecentDrillQuestions,
  getActiveDrillSession,
  saveDrillSession,
  getDrillSessions,
  getAllDrillSessions,
  setUserTopicDifficulty,
  getUserMostRecentRoleTitle
};

