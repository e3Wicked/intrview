import { describe, it, expect } from 'vitest';
import {
  LEVELS,
  BASE_XP,
  SCORE_BONUS,
  STREAK_MULTIPLIERS,
  DAILY_LOGIN_BONUS,
  getLevelForXp,
  getScoreBonus,
  getStreakMultiplier,
  calculateXpForAttempt,
} from '../utils/gamification.js';

describe('LEVELS constant', () => {
  it('should start at level 1 with 0 XP required', () => {
    expect(LEVELS[0].level).toBe(1);
    expect(LEVELS[0].xpRequired).toBe(0);
  });

  it('should have monotonically increasing XP requirements', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].xpRequired).toBeGreaterThan(LEVELS[i - 1].xpRequired);
    }
  });

  it('should have sequential level numbers', () => {
    LEVELS.forEach((level, index) => {
      expect(level.level).toBe(index + 1);
    });
  });

  it('should have a title for every level', () => {
    LEVELS.forEach((level) => {
      expect(level.title).toBeTruthy();
      expect(typeof level.title).toBe('string');
    });
  });
});

describe('getLevelForXp', () => {
  it('should return level 1 for 0 XP', () => {
    const result = getLevelForXp(0);
    expect(result.level).toBe(1);
    expect(result.title).toBe('Applicant');
  });

  it('should return level 2 at exactly 100 XP', () => {
    const result = getLevelForXp(100);
    expect(result.level).toBe(2);
    expect(result.title).toBe('Candidate');
  });

  it('should return level 1 at 99 XP (just below threshold)', () => {
    const result = getLevelForXp(99);
    expect(result.level).toBe(1);
  });

  it('should return the max level for very high XP', () => {
    const result = getLevelForXp(999999);
    expect(result.level).toBe(LEVELS[LEVELS.length - 1].level);
  });

  it('should calculate correct progress percent mid-level', () => {
    // Level 1 requires 0, level 2 requires 100 => 50 XP = 50%
    const result = getLevelForXp(50);
    expect(result.progressPercent).toBe(50);
  });

  it('should cap progress at 100% for max level', () => {
    const result = getLevelForXp(999999);
    expect(result.progressPercent).toBe(100);
  });

  it('should report 0 xpNeededForNext at max level', () => {
    const maxXp = LEVELS[LEVELS.length - 1].xpRequired;
    const result = getLevelForXp(maxXp);
    expect(result.xpNeededForNext).toBe(0);
  });

  it('should return correct xpIntoLevel', () => {
    // At 150 XP, level 2 starts at 100 => xpIntoLevel = 50
    const result = getLevelForXp(150);
    expect(result.level).toBe(2);
    expect(result.xpIntoLevel).toBe(50);
  });

  it('should handle boundary between levels 5 and 6', () => {
    // Level 5 at 1000, level 6 at 1500
    expect(getLevelForXp(999).level).toBe(4); // 600-999 is level 4
    expect(getLevelForXp(1000).level).toBe(5);
    expect(getLevelForXp(1499).level).toBe(5);
    expect(getLevelForXp(1500).level).toBe(6);
  });
});

describe('getScoreBonus', () => {
  it('should return 15 for a perfect score (100)', () => {
    expect(getScoreBonus(100)).toBe(15);
  });

  it('should return 15 for score >= 90', () => {
    expect(getScoreBonus(90)).toBe(15);
    expect(getScoreBonus(95)).toBe(15);
  });

  it('should return 10 for score 80-89', () => {
    expect(getScoreBonus(80)).toBe(10);
    expect(getScoreBonus(89)).toBe(10);
  });

  it('should return 5 for score 70-79', () => {
    expect(getScoreBonus(70)).toBe(5);
    expect(getScoreBonus(79)).toBe(5);
  });

  it('should return 2 for score 50-69', () => {
    expect(getScoreBonus(50)).toBe(2);
    expect(getScoreBonus(69)).toBe(2);
  });

  it('should return 0 for score below 50', () => {
    expect(getScoreBonus(0)).toBe(0);
    expect(getScoreBonus(49)).toBe(0);
  });
});

describe('getStreakMultiplier', () => {
  it('should return 1.0 for 0 streak days', () => {
    expect(getStreakMultiplier(0)).toBe(1.0);
  });

  it('should return 1.25 for 3-day streak', () => {
    expect(getStreakMultiplier(3)).toBe(1.25);
  });

  it('should return 1.5 for 7-day streak', () => {
    expect(getStreakMultiplier(7)).toBe(1.5);
  });

  it('should return 1.75 for 14-day streak', () => {
    expect(getStreakMultiplier(14)).toBe(1.75);
  });

  it('should return 2.0 for 30-day streak', () => {
    expect(getStreakMultiplier(30)).toBe(2.0);
  });

  it('should return 2.0 for streaks longer than 30 days', () => {
    expect(getStreakMultiplier(100)).toBe(2.0);
  });

  it('should return 1.0 for 1-2 day streaks (below threshold)', () => {
    expect(getStreakMultiplier(1)).toBe(1.0);
    expect(getStreakMultiplier(2)).toBe(1.0);
  });
});

describe('calculateXpForAttempt', () => {
  it('should calculate base XP for quiz with no bonuses', () => {
    const result = calculateXpForAttempt('quiz', 0, 0, false);
    expect(result.xp).toBe(BASE_XP.quiz); // 10
    expect(result.base).toBe(BASE_XP.quiz);
    expect(result.scoreBonus).toBe(0);
    expect(result.multiplier).toBe(1.0);
    expect(result.dailyBonus).toBe(0);
  });

  it('should calculate base XP for voice with no bonuses', () => {
    const result = calculateXpForAttempt('voice', 0, 0, false);
    expect(result.xp).toBe(BASE_XP.voice); // 15
  });

  it('should add score bonus for quiz mode', () => {
    const result = calculateXpForAttempt('quiz', 100, 0, false);
    // base 10 + scoreBonus 15 = 25
    expect(result.xp).toBe(25);
    expect(result.scoreBonus).toBe(15);
  });

  it('should add score bonus for voice mode', () => {
    const result = calculateXpForAttempt('voice', 85, 0, false);
    // base 15 + scoreBonus 10 = 25
    expect(result.xp).toBe(25);
  });

  it('should NOT add score bonus for flashcard modes', () => {
    const result = calculateXpForAttempt('flashcard_known', 100, 0, false);
    expect(result.scoreBonus).toBe(0);
    expect(result.xp).toBe(BASE_XP.flashcard_known); // 3
  });

  it('should apply streak multiplier', () => {
    const result = calculateXpForAttempt('quiz', 0, 7, false);
    // base 10 * 1.5 = 15
    expect(result.xp).toBe(15);
    expect(result.multiplier).toBe(1.5);
  });

  it('should add daily login bonus when isFirstToday is true', () => {
    const result = calculateXpForAttempt('quiz', 0, 0, true);
    // base 10 * 1.0 + 25 daily = 35
    expect(result.xp).toBe(10 + DAILY_LOGIN_BONUS);
    expect(result.dailyBonus).toBe(DAILY_LOGIN_BONUS);
  });

  it('should combine all bonuses correctly', () => {
    // quiz, score 95 (bonus 15), 7-day streak (1.5x), first today
    const result = calculateXpForAttempt('quiz', 95, 7, true);
    // (10 + 15) * 1.5 = 37.5 => floor = 37, + 25 daily = 62
    expect(result.xp).toBe(Math.floor((10 + 15) * 1.5) + 25);
    expect(result.xp).toBe(62);
  });

  it('should return 0 XP for unknown mode', () => {
    const result = calculateXpForAttempt('unknown', 100, 0, false);
    expect(result.base).toBe(0);
  });

  it('should floor the result after multiplier', () => {
    // flashcard_known (3) with 3-day streak (1.25x) = 3.75 => floor = 3
    const result = calculateXpForAttempt('flashcard_known', 0, 3, false);
    expect(result.xp).toBe(Math.floor(3 * 1.25));
    expect(result.xp).toBe(3);
  });
});
