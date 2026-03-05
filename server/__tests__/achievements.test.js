import { describe, it, expect } from 'vitest';
import { ACHIEVEMENTS } from '../utils/gamification.js';

describe('ACHIEVEMENTS data integrity', () => {
  it('should have unique IDs', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have required fields on every achievement', () => {
    ACHIEVEMENTS.forEach((a) => {
      expect(a.id).toBeTruthy();
      expect(a.name).toBeTruthy();
      expect(a.description).toBeTruthy();
      expect(a.icon).toBeTruthy();
      expect(typeof a.xpReward).toBe('number');
      expect(a.xpReward).toBeGreaterThan(0);
    });
  });

  it('should have expected category achievements', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);

    // Getting started
    expect(ids).toContain('first_quiz');
    expect(ids).toContain('first_voice');
    expect(ids).toContain('first_session');

    // Volume
    expect(ids).toContain('ten_questions');
    expect(ids).toContain('hundred_questions');

    // Streaks
    expect(ids).toContain('streak_3');
    expect(ids).toContain('streak_7');
    expect(ids).toContain('streak_30');

    // Special
    expect(ids).toContain('night_owl');
    expect(ids).toContain('early_bird');
  });

  it('should have higher rewards for harder achievements', () => {
    const find = (id) => ACHIEVEMENTS.find((a) => a.id === id);

    // Volume achievements should scale
    expect(find('hundred_questions').xpReward).toBeGreaterThan(find('ten_questions').xpReward);
    expect(find('five_hundred_qs').xpReward).toBeGreaterThan(find('hundred_questions').xpReward);

    // Streak achievements should scale
    expect(find('streak_30').xpReward).toBeGreaterThan(find('streak_7').xpReward);
    expect(find('streak_7').xpReward).toBeGreaterThan(find('streak_3').xpReward);
  });

  it('should have consistent first-time achievement rewards', () => {
    const find = (id) => ACHIEVEMENTS.find((a) => a.id === id);
    // All "getting started" achievements reward the same XP
    expect(find('first_quiz').xpReward).toBe(25);
    expect(find('first_voice').xpReward).toBe(25);
    expect(find('first_session').xpReward).toBe(25);
  });
});
