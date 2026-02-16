import { pool } from '../db.js';
import { ACHIEVEMENTS } from './gamification.js';

// Check all achievement conditions for a user and return newly unlocked ones
export async function checkAndUnlockAchievements(userId) {
  const earned = await getEarnedAchievementIds(userId);
  const stats = await getUserAchievementStats(userId);
  const newlyUnlocked = [];

  for (const achievement of ACHIEVEMENTS) {
    if (earned.has(achievement.id)) continue;

    const unlocked = evaluateCondition(achievement.id, stats);
    if (unlocked) {
      await unlockAchievement(userId, achievement.id);
      newlyUnlocked.push(achievement);
    }
  }

  return newlyUnlocked;
}

async function getEarnedAchievementIds(userId) {
  const result = await pool.query(
    'SELECT achievement_id FROM user_achievements WHERE user_id = $1',
    [userId]
  );
  return new Set(result.rows.map(r => r.achievement_id));
}

async function unlockAchievement(userId, achievementId) {
  await pool.query(
    'INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT (user_id, achievement_id) DO NOTHING',
    [userId, achievementId]
  );
}

async function getUserAchievementStats(userId) {
  const [attemptsRes, sessionsRes, streakRes, progressRes, companiesRes, timeRes, improvementRes] = await Promise.all([
    // Total attempts by type
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE attempt_type = 'quiz') as quiz_attempts,
        COUNT(*) FILTER (WHERE attempt_type = 'voice') as voice_attempts,
        COUNT(*) as total_attempts,
        AVG(score) FILTER (WHERE score IS NOT NULL) as average_score,
        COUNT(*) FILTER (WHERE score = 100) as perfect_scores
      FROM question_attempts WHERE user_id = $1
    `, [userId]),

    // Sessions completed
    pool.query(
      'SELECT COUNT(*) as sessions_completed FROM practice_sessions WHERE user_id = $1 AND ended_at IS NOT NULL',
      [userId]
    ),

    // Streak info
    pool.query(
      'SELECT current_streak, longest_streak FROM user_streaks WHERE user_id = $1',
      [userId]
    ),

    // Topics completed across all jobs
    pool.query(`
      SELECT
        COALESCE(SUM(array_length(topics_completed, 1)), 0) as topics_completed,
        COUNT(*) as job_count
      FROM user_progress WHERE user_id = $1
    `, [userId]),

    // Unique companies practiced for
    pool.query(
      'SELECT COUNT(DISTINCT job_description_hash) as unique_companies FROM question_attempts WHERE user_id = $1',
      [userId]
    ),

    // Time-based: check latest attempt time
    pool.query(
      'SELECT created_at FROM question_attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    ),

    // Score improvement: find questions attempted more than once with improvement >= 10
    pool.query(`
      SELECT COUNT(*) as improved_count FROM (
        SELECT question_text,
               MAX(score) - MIN(score) as improvement
        FROM question_attempts
        WHERE user_id = $1 AND score IS NOT NULL
        GROUP BY question_text
        HAVING COUNT(*) >= 2 AND MAX(score) - MIN(score) >= 10
      ) sub
    `, [userId]),
  ]);

  const attempts = attemptsRes.rows[0];
  const streak = streakRes.rows[0] || { current_streak: 0, longest_streak: 0 };
  const latestAttempt = timeRes.rows[0]?.created_at;
  const latestHour = latestAttempt ? new Date(latestAttempt).getHours() : null;

  // Check if all topics complete for any job
  let allTopicsComplete = false;
  if (progressRes.rows[0]?.job_count > 0) {
    const fullCheck = await pool.query(`
      SELECT up.job_description_hash, array_length(up.topics_completed, 1) as completed_count
      FROM user_progress up
      JOIN study_plans sp ON sp.job_description_hash = up.job_description_hash
      WHERE up.user_id = $1 AND array_length(up.topics_completed, 1) > 0
    `, [userId]);
    // We'd need to compare against total topics in each study plan
    // Simplified: check if any job has >= 5 completed topics
    allTopicsComplete = fullCheck.rows.some(r => r.completed_count >= 5);
  }

  return {
    quiz_attempts: parseInt(attempts.quiz_attempts) || 0,
    voice_attempts: parseInt(attempts.voice_attempts) || 0,
    total_attempts: parseInt(attempts.total_attempts) || 0,
    average_score: parseFloat(attempts.average_score) || 0,
    perfect_scores: parseInt(attempts.perfect_scores) || 0,
    sessions_completed: parseInt(sessionsRes.rows[0].sessions_completed) || 0,
    current_streak: streak.current_streak || 0,
    longest_streak: streak.longest_streak || 0,
    topics_completed: parseInt(progressRes.rows[0]?.topics_completed) || 0,
    all_topics_complete: allTopicsComplete,
    unique_companies: parseInt(companiesRes.rows[0]?.unique_companies) || 0,
    latest_hour: latestHour,
    has_improvement: parseInt(improvementRes.rows[0]?.improved_count) > 0,
  };
}

function evaluateCondition(achievementId, stats) {
  switch (achievementId) {
    // Getting Started
    case 'first_quiz':        return stats.quiz_attempts >= 1;
    case 'first_voice':       return stats.voice_attempts >= 1;
    case 'first_session':     return stats.sessions_completed >= 1;

    // Volume
    case 'ten_questions':     return stats.total_attempts >= 10;
    case 'fifty_questions':   return stats.total_attempts >= 50;
    case 'hundred_questions': return stats.total_attempts >= 100;
    case 'five_hundred_qs':   return stats.total_attempts >= 500;

    // Scores
    case 'perfect_score':     return stats.perfect_scores >= 1;
    case 'three_perfect':     return stats.perfect_scores >= 3;
    case 'avg_above_80':      return stats.average_score >= 80 && stats.total_attempts >= 10;
    case 'avg_above_90':      return stats.average_score >= 90 && stats.total_attempts >= 20;

    // Streaks
    case 'streak_3':          return stats.current_streak >= 3;
    case 'streak_7':          return stats.current_streak >= 7;
    case 'streak_14':         return stats.current_streak >= 14;
    case 'streak_30':         return stats.current_streak >= 30;

    // Progress
    case 'first_topic':       return stats.topics_completed >= 1;
    case 'all_topics':        return stats.all_topics_complete;
    case 'multi_company':     return stats.unique_companies >= 3;

    // Special
    case 'night_owl':         return stats.latest_hour !== null && stats.latest_hour >= 0 && stats.latest_hour < 5;
    case 'early_bird':        return stats.latest_hour !== null && stats.latest_hour >= 5 && stats.latest_hour < 7;
    case 'improvement_10':    return stats.has_improvement;

    default: return false;
  }
}
