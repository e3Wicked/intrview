-- Create database (run this manually: createdb interview_prepper)
-- Then run this file: psql -U postgres -d interview_prepper -f setup-db.sql

-- companies table: Store company information
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) UNIQUE NOT NULL, -- lowercase, normalized for lookup
  founded VARCHAR(10), -- year as string
  description TEXT,
  logo_url TEXT,
  company_website TEXT,
  linkedin_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- company_founders table: Store founder information
CREATE TABLE IF NOT EXISTS company_founders (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  linkedin_url TEXT,
  background TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- company_funding_rounds table: Store funding rounds
CREATE TABLE IF NOT EXISTS company_funding_rounds (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  year INTEGER,
  month VARCHAR(20),
  type VARCHAR(50), -- "Seed", "Series A", etc.
  amount VARCHAR(50), -- "$150M"
  lead_investors TEXT[], -- Array of investor names
  description TEXT,
  source VARCHAR(50) DEFAULT 'openai', -- 'openai', 'company_research', etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- company_research table: Store company research (with TTL)
CREATE TABLE IF NOT EXISTS company_research (
  id SERIAL PRIMARY KEY,
  company_id INTEGER UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  recent_news JSONB, -- Array of news items
  culture TEXT,
  tech_stack TEXT[], -- Array of technologies
  team_size VARCHAR(100),
  achievements JSONB, -- Array of achievements
  unique_aspects JSONB, -- Array of unique aspects
  interview_tips JSONB, -- Array of tips
  values JSONB, -- Array of values
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP -- 7 days from cached_at
);

-- study_plans table: Cache study plans by job description hash
CREATE TABLE IF NOT EXISTS study_plans (
  id SERIAL PRIMARY KEY,
  job_description_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA256 hash
  study_plan JSONB NOT NULL, -- Full study plan JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- job_url_cache table: Cache logo and role title by URL to avoid repeated API calls
CREATE TABLE IF NOT EXISTS job_url_cache (
  id SERIAL PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  role_title VARCHAR(255),
  company_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_url_cache_url ON job_url_cache(url);

-- users table: Store user accounts
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  password_hash VARCHAR(255), -- For email/password auth
  google_id VARCHAR(255) UNIQUE, -- For Google OAuth
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- subscriptions table: Store Stripe subscription data
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'free', -- 'free', 'starter', 'pro', 'elite'
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'canceled', 'past_due'
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  credits_remaining INTEGER DEFAULT 0,
  credits_monthly_allowance INTEGER DEFAULT 0,
  credits_reset_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- user_sessions table: Store authentication sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_companies_normalized_name ON companies(normalized_name);
CREATE INDEX IF NOT EXISTS idx_company_research_expires_at ON company_research(expires_at);
CREATE INDEX IF NOT EXISTS idx_funding_rounds_company_id ON company_funding_rounds(company_id);
CREATE INDEX IF NOT EXISTS idx_study_plans_hash ON study_plans(job_description_hash);

-- Add comment
COMMENT ON TABLE companies IS 'Stores company information to avoid repeated OpenAI calls';
COMMENT ON TABLE study_plans IS 'Caches study plans by job description hash to reuse for identical job postings';

