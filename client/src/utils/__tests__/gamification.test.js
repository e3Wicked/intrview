import { describe, it, expect } from 'vitest';
import { LEVELS, ACHIEVEMENTS, getLevelForXp } from '../gamification.js';

describe('client-side gamification utils', () => {
  describe('LEVELS', () => {
    it('should have 12 levels', () => {
      expect(LEVELS.length).toBe(12);
    });

    it('should start at level 1 with 0 XP', () => {
      expect(LEVELS[0]).toEqual({ level: 1, title: 'Applicant', xpRequired: 0 });
    });

    it('should end at level 12 (Fellow)', () => {
      const last = LEVELS[LEVELS.length - 1];
      expect(last.level).toBe(12);
      expect(last.title).toBe('Fellow');
    });
  });

  describe('ACHIEVEMENTS', () => {
    it('should have more than 15 achievements', () => {
      expect(ACHIEVEMENTS.length).toBeGreaterThan(15);
    });

    it('should have unique IDs', () => {
      const ids = ACHIEVEMENTS.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('getLevelForXp', () => {
    it('should mirror server behavior for level 1', () => {
      const result = getLevelForXp(0);
      expect(result.level).toBe(1);
      expect(result.title).toBe('Applicant');
      expect(result.progressPercent).toBe(0);
    });

    it('should return level 5 at 1000 XP', () => {
      const result = getLevelForXp(1000);
      expect(result.level).toBe(5);
      expect(result.title).toBe('Developer');
    });

    it('should calculate progress within a level', () => {
      // Level 2 starts at 100, level 3 at 300 => range 200, at 200 XP => 50%
      const result = getLevelForXp(200);
      expect(result.level).toBe(2);
      expect(result.progressPercent).toBe(50);
    });
  });
});
