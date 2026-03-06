-- Drill session history: tracks each completed drill session per user per topic
CREATE TABLE IF NOT EXISTS drill_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  answers INTEGER DEFAULT 0,
  avg_score FLOAT,
  scores JSONB DEFAULT '[]',
  xp_earned INTEGER DEFAULT 0,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drill_sessions_user ON drill_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_drill_sessions_topic ON drill_sessions(topic_id);
CREATE INDEX IF NOT EXISTS idx_drill_sessions_user_topic ON drill_sessions(user_id, topic_id);
