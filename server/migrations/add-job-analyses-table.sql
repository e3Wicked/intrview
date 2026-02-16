-- Add job_analyses table to track user job analyses
CREATE TABLE IF NOT EXISTS job_analyses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  job_description_hash VARCHAR(64) NOT NULL,
  company_name VARCHAR(255),
  role_title VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_analyses_user_id ON job_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_job_analyses_created_at ON job_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_analyses_hash ON job_analyses(job_description_hash);

COMMENT ON TABLE job_analyses IS 'Tracks all job analyses performed by users';


