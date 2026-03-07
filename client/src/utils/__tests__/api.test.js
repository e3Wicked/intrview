import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock axios before importing api
vi.mock('axios', () => {
  const mockAxios = {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  };
  return { default: mockAxios };
});

import axios from 'axios';
import { api } from '../api.js';

describe('api utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('api.progress', () => {
    it('should call GET /api/progress/:jobHash', async () => {
      await api.progress.get('abc123');
      expect(axios.get).toHaveBeenCalledWith('/api/progress/abc123');
    });

    it('should call POST /api/progress/save', async () => {
      const data = { jobHash: 'abc', score: 80 };
      await api.progress.save(data);
      expect(axios.post).toHaveBeenCalledWith('/api/progress/save', data);
    });

    it('should call GET /api/progress/overall', async () => {
      await api.progress.getOverall();
      expect(axios.get).toHaveBeenCalledWith('/api/progress/overall');
    });

    it('should call POST /api/progress/migrate', async () => {
      const data = { fromHash: 'a', toHash: 'b' };
      await api.progress.migrate(data);
      expect(axios.post).toHaveBeenCalledWith('/api/progress/migrate', data);
    });
  });

  describe('api.practice', () => {
    it('should call POST /api/practice/start-session', async () => {
      const data = { jobHash: 'abc', mode: 'quiz' };
      await api.practice.startSession(data);
      expect(axios.post).toHaveBeenCalledWith('/api/practice/start-session', data);
    });

    it('should call POST /api/practice/end-session', async () => {
      const data = { sessionId: 1 };
      await api.practice.endSession(data);
      expect(axios.post).toHaveBeenCalledWith('/api/practice/end-session', data);
    });

    it('should call GET /api/practice/history with params', async () => {
      const params = { jobHash: 'abc' };
      await api.practice.getHistory(params);
      expect(axios.get).toHaveBeenCalledWith('/api/practice/history', { params });
    });

    it('should call POST /api/practice/smart-order', async () => {
      const data = { questions: [] };
      await api.practice.getSmartOrder(data);
      expect(axios.post).toHaveBeenCalledWith('/api/practice/smart-order', data);
    });

    it('should call POST /api/practice/flashcard-attempt', async () => {
      const data = { known: true };
      await api.practice.flashcardAttempt(data);
      expect(axios.post).toHaveBeenCalledWith('/api/practice/flashcard-attempt', data);
    });
  });

  describe('api.chat', () => {
    it('should call POST /api/chat/practice', async () => {
      const data = { message: 'hello' };
      await api.chat.practice(data);
      expect(axios.post).toHaveBeenCalledWith('/api/chat/practice', data);
    });
  });

});
