-- Add structured drill fields to drill_sessions
ALTER TABLE drill_sessions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';
ALTER TABLE drill_sessions ADD COLUMN IF NOT EXISTS question_count INTEGER DEFAULT 5;
ALTER TABLE drill_sessions ADD COLUMN IF NOT EXISTS questions_answered INTEGER DEFAULT 0;
ALTER TABLE drill_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Individual questions within a drill session
CREATE TABLE IF NOT EXISTS drill_questions (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES drill_sessions(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  user_answer TEXT,
  coach_response TEXT,
  score INTEGER CHECK (score >= 0 AND score <= 100),
  feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, question_number)
);

CREATE INDEX IF NOT EXISTS idx_drill_questions_session ON drill_questions(session_id);
