CREATE TABLE IF NOT EXISTS mock_interview_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_description_hash VARCHAR(64),
  job_title VARCHAR(255),
  company_name VARCHAR(255),
  round_type VARCHAR(50) NOT NULL DEFAULT 'comprehensive',
  voice_id VARCHAR(255),
  questions JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  current_question_index INTEGER NOT NULL DEFAULT 0,
  overall_score INTEGER,
  scorecard JSONB,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mock_interview_responses (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES mock_interview_sessions(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  user_transcript TEXT,
  ai_response_text TEXT,
  score INTEGER,
  brief TEXT,
  is_follow_up BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mock_sessions_user ON mock_interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mock_responses_session ON mock_interview_responses(session_id);

-- Backfill columns if migration was already applied with old schema
ALTER TABLE mock_interview_responses ADD COLUMN IF NOT EXISTS user_transcript TEXT;
ALTER TABLE mock_interview_responses ADD COLUMN IF NOT EXISTS ai_response_text TEXT;
ALTER TABLE mock_interview_responses ADD COLUMN IF NOT EXISTS score INTEGER;
ALTER TABLE mock_interview_responses ADD COLUMN IF NOT EXISTS brief TEXT;
ALTER TABLE mock_interview_sessions ADD COLUMN IF NOT EXISTS overall_score INTEGER;
