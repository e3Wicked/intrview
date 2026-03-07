-- Drop pure gamification tables
DROP TABLE IF EXISTS user_achievements;
DROP TABLE IF EXISTS user_xp_log;
DROP TABLE IF EXISTS user_streaks;

-- Remove gamification columns from users
ALTER TABLE users DROP COLUMN IF EXISTS total_xp;
ALTER TABLE users DROP COLUMN IF EXISTS current_level;

-- Remove xp columns from practice_sessions and drill_sessions
ALTER TABLE practice_sessions DROP COLUMN IF EXISTS total_xp_earned;
ALTER TABLE question_attempts DROP COLUMN IF EXISTS xp_earned;
ALTER TABLE drill_sessions DROP COLUMN IF EXISTS xp_earned;
