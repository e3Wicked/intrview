// Gamification constants and utilities

export const LEVELS = [
  { level: 1,  title: 'Applicant',      xpRequired: 0 },
  { level: 2,  title: 'Candidate',      xpRequired: 100 },
  { level: 3,  title: 'Intern',         xpRequired: 300 },
  { level: 4,  title: 'Junior Dev',     xpRequired: 600 },
  { level: 5,  title: 'Developer',      xpRequired: 1000 },
  { level: 6,  title: 'Mid-Level',      xpRequired: 1500 },
  { level: 7,  title: 'Senior Dev',     xpRequired: 2200 },
  { level: 8,  title: 'Lead',           xpRequired: 3000 },
  { level: 9,  title: 'Staff Engineer', xpRequired: 4000 },
  { level: 10, title: 'Principal',      xpRequired: 5500 },
  { level: 11, title: 'Distinguished',  xpRequired: 7500 },
  { level: 12, title: 'Fellow',         xpRequired: 10000 },
];

export const BASE_XP = {
  quiz: 10,
  voice: 15,
  flashcard_known: 3,
  flashcard_practice: 1,
};

export const SCORE_BONUS = [
  { min: 90, bonus: 15 },
  { min: 80, bonus: 10 },
  { min: 70, bonus: 5 },
  { min: 50, bonus: 2 },
  { min: 0,  bonus: 0 },
];

export const STREAK_MULTIPLIERS = [
  { minDays: 30, multiplier: 2.0 },
  { minDays: 14, multiplier: 1.75 },
  { minDays: 7,  multiplier: 1.5 },
  { minDays: 3,  multiplier: 1.25 },
  { minDays: 0,  multiplier: 1.0 },
];

export const DAILY_LOGIN_BONUS = 25;

export function getLevelForXp(totalXp) {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (totalXp >= level.xpRequired) {
      current = level;
    } else {
      break;
    }
  }
  const nextLevel = LEVELS.find(l => l.level === current.level + 1);
  const xpIntoLevel = totalXp - current.xpRequired;
  const xpForNextLevel = nextLevel ? nextLevel.xpRequired - current.xpRequired : 0;
  const progressPercent = xpForNextLevel > 0 ? Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100)) : 100;

  return {
    level: current.level,
    title: current.title,
    xpForCurrentLevel: current.xpRequired,
    xpForNextLevel: nextLevel ? nextLevel.xpRequired : current.xpRequired,
    xpIntoLevel,
    xpNeededForNext: xpForNextLevel,
    progressPercent,
  };
}

export function getScoreBonus(score) {
  for (const tier of SCORE_BONUS) {
    if (score >= tier.min) return tier.bonus;
  }
  return 0;
}

export function getStreakMultiplier(streakDays) {
  for (const tier of STREAK_MULTIPLIERS) {
    if (streakDays >= tier.minDays) return tier.multiplier;
  }
  return 1.0;
}

export function calculateXpForAttempt(mode, score, streakDays, isFirstToday = false) {
  let base = 0;
  if (mode === 'quiz') base = BASE_XP.quiz;
  else if (mode === 'voice') base = BASE_XP.voice;
  else if (mode === 'flashcard_known') base = BASE_XP.flashcard_known;
  else if (mode === 'flashcard_practice') base = BASE_XP.flashcard_practice;

  const scoreBonus = (mode === 'quiz' || mode === 'voice') ? getScoreBonus(score) : 0;
  const multiplier = getStreakMultiplier(streakDays);
  const dailyBonus = isFirstToday ? DAILY_LOGIN_BONUS : 0;

  const xp = Math.floor((base + scoreBonus) * multiplier) + dailyBonus;
  return { xp, base, scoreBonus, multiplier, dailyBonus };
}

export const ACHIEVEMENTS = [
  // Getting Started
  { id: 'first_quiz',        name: 'First Steps',         description: 'Complete your first quiz question',            icon: '🎯', xpReward: 25 },
  { id: 'first_voice',       name: 'Speak Up',            description: 'Complete your first voice practice',           icon: '🎤', xpReward: 25 },
  { id: 'first_session',     name: 'Session Starter',     description: 'Complete your first practice session',         icon: '📝', xpReward: 25 },

  // Volume
  { id: 'ten_questions',     name: 'Getting Warmed Up',   description: 'Answer 10 questions',                          icon: '🔥', xpReward: 50 },
  { id: 'fifty_questions',   name: 'Dedicated Learner',   description: 'Answer 50 questions',                          icon: '📚', xpReward: 100 },
  { id: 'hundred_questions', name: 'Question Machine',    description: 'Answer 100 questions',                         icon: '⚡', xpReward: 200 },
  { id: 'five_hundred_qs',   name: 'Interview Warrior',   description: 'Answer 500 questions',                         icon: '🏆', xpReward: 500 },

  // Scores
  { id: 'perfect_score',     name: 'Nailed It',           description: 'Score 100 on a question',                      icon: '💯', xpReward: 50 },
  { id: 'three_perfect',     name: 'Hat Trick',           description: 'Score 100 on 3 questions',                     icon: '🎩', xpReward: 100 },
  { id: 'avg_above_80',      name: 'High Performer',      description: 'Average score above 80 (10+ questions)',        icon: '⭐', xpReward: 75 },
  { id: 'avg_above_90',      name: 'Elite Performer',     description: 'Average score above 90 (20+ questions)',        icon: '🌟', xpReward: 150 },

  // Streaks
  { id: 'streak_3',          name: 'Three-peat',          description: 'Maintain a 3-day streak',                      icon: '🔥', xpReward: 50 },
  { id: 'streak_7',          name: 'Full Week',           description: 'Maintain a 7-day streak',                      icon: '🗓️', xpReward: 100 },
  { id: 'streak_14',         name: 'Two Weeks Strong',    description: 'Maintain a 14-day streak',                     icon: '💪', xpReward: 200 },
  { id: 'streak_30',         name: 'Monthly Master',      description: 'Maintain a 30-day streak',                     icon: '👑', xpReward: 500 },

  // Progress
  { id: 'first_topic',       name: 'Topic Explorer',      description: 'Complete your first study topic',              icon: '📖', xpReward: 25 },
  { id: 'all_topics',        name: 'Completionist',       description: 'Complete all topics in a study plan',          icon: '🏅', xpReward: 300 },
  { id: 'multi_company',     name: 'Playing the Field',   description: 'Practice for 3 different companies',           icon: '🎯', xpReward: 100 },

  // Special
  { id: 'night_owl',         name: 'Night Owl',           description: 'Practice after midnight',                      icon: '🦉', xpReward: 25 },
  { id: 'early_bird',        name: 'Early Bird',          description: 'Practice before 7 AM',                         icon: '🐦', xpReward: 25 },
  { id: 'improvement_10',    name: 'Growth Mindset',      description: 'Improve score by 10+ on a repeated question',  icon: '📈', xpReward: 75 },
];
