-- ============================================================
-- Migration: Gamification & Progress Persistence System
-- ============================================================

-- 1. user_progress: Server-side progress per user per job analysis
-- Replaces localStorage('interviewPrepperProgress') and localStorage('interviewPrepperConfidence')
CREATE TABLE IF NOT EXISTS user_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_description_hash VARCHAR(64) NOT NULL,
  topics_studied TEXT[] DEFAULT '{}',
  topics_completed TEXT[] DEFAULT '{}',
  confidence_scores JSONB DEFAULT '{}',
  flashcard_progress JSONB DEFAULT '{}',
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, job_description_hash)
);

CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_hash ON user_progress(job_description_hash);

-- 2. question_attempts: Every quiz/voice attempt with score
CREATE TABLE IF NOT EXISTS question_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_description_hash VARCHAR(64) NOT NULL,
  session_id INTEGER,
  question_text TEXT NOT NULL,
  question_category VARCHAR(100),
  attempt_type VARCHAR(20) NOT NULL DEFAULT 'quiz',
  user_answer TEXT,
  score INTEGER CHECK (score >= 0 AND score <= 100),
  evaluation JSONB,
  xp_earned INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_question_attempts_user_id ON question_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_question_attempts_hash ON question_attempts(job_description_hash);
CREATE INDEX IF NOT EXISTS idx_question_attempts_session ON question_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_question_attempts_created ON question_attempts(created_at DESC);

-- 3. practice_sessions: Track practice sessions
CREATE TABLE IF NOT EXISTS practice_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_description_hash VARCHAR(64) NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  mode VARCHAR(20) DEFAULT 'quiz',
  questions_attempted INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  average_score NUMERIC(5,2) DEFAULT 0,
  total_xp_earned INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_id ON practice_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_hash ON practice_sessions(job_description_hash);

-- Add FK from question_attempts to practice_sessions
ALTER TABLE question_attempts
  ADD CONSTRAINT fk_question_attempts_session
  FOREIGN KEY (session_id) REFERENCES practice_sessions(id) ON DELETE SET NULL;

-- 4. user_streaks: Daily streak tracking (one row per user)
CREATE TABLE IF NOT EXISTS user_streaks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_practice_date DATE,
  streak_multiplier NUMERIC(3,2) DEFAULT 1.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_streaks_user_id ON user_streaks(user_id);

-- 5. user_achievements: Unlocked achievements
CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id VARCHAR(50) NOT NULL,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);

-- 6. user_xp_log: XP earning history
CREATE TABLE IF NOT EXISTS user_xp_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  xp_amount INTEGER NOT NULL,
  source VARCHAR(50) NOT NULL,
  source_id INTEGER,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_xp_log_user_id ON user_xp_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_xp_log_created ON user_xp_log(created_at DESC);

-- 7. Add XP and level columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_level INTEGER DEFAULT 1;
