-- Advertisers table: Store sponsor/advertiser information with cached logos
CREATE TABLE IF NOT EXISTS advertisers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL, -- e.g., 'stripe.com'
  description TEXT,
  logo_url TEXT, -- Cached logo URL (from clearbit, logo.dev, etc.)
  website_url TEXT, -- Link to their careers/jobs page
  job_count INTEGER DEFAULT 0, -- Number of open positions
  is_actively_hiring BOOLEAN DEFAULT false, -- Flag for companies with many openings
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  last_job_count_update TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(domain)
);

CREATE INDEX IF NOT EXISTS idx_advertisers_active ON advertisers(is_active, display_order);

-- Add new columns if they don't exist (for existing databases)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='advertisers' AND column_name='job_count') THEN
    ALTER TABLE advertisers ADD COLUMN job_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='advertisers' AND column_name='is_actively_hiring') THEN
    ALTER TABLE advertisers ADD COLUMN is_actively_hiring BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='advertisers' AND column_name='last_job_count_update') THEN
    ALTER TABLE advertisers ADD COLUMN last_job_count_update TIMESTAMP;
  END IF;
END $$;

