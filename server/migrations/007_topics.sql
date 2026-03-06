-- Normalized topics table
CREATE TABLE IF NOT EXISTS topics (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(100),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction: which topics appear in which job posts
CREATE TABLE IF NOT EXISTS job_topics (
  id SERIAL PRIMARY KEY,
  job_description_hash VARCHAR(64) NOT NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
  relevance_score FLOAT DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_description_hash, topic_id)
);

-- Per-user proficiency per topic
CREATE TABLE IF NOT EXISTS user_topic_scores (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
  score FLOAT DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  last_practiced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_topics_normalized ON topics(normalized_name);
CREATE INDEX IF NOT EXISTS idx_topics_category ON topics(category);
CREATE INDEX IF NOT EXISTS idx_job_topics_hash ON job_topics(job_description_hash);
CREATE INDEX IF NOT EXISTS idx_job_topics_topic ON job_topics(topic_id);
CREATE INDEX IF NOT EXISTS idx_user_topic_scores_user ON user_topic_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_user_topic_scores_topic ON user_topic_scores(topic_id);
