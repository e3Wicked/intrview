-- Add skill/topic_name column to practice_sessions for focus chat tracking
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS skill VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_skill ON practice_sessions(skill);
