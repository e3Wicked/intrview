import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the GamificationContext
vi.mock('../../contexts/GamificationContext', () => ({
  useGamification: vi.fn(),
}));

import { useGamification } from '../../contexts/GamificationContext';
import StreakCounter from '../StreakCounter.jsx';

describe('StreakCounter', () => {
  it('should render nothing when gamStats is null', () => {
    useGamification.mockReturnValue(null);
    const { container } = render(<StreakCounter />);
    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when gamStats is undefined', () => {
    useGamification.mockReturnValue({ gamStats: undefined });
    const { container } = render(<StreakCounter />);
    expect(container.firstChild).toBeNull();
  });

  it('should display current streak number', () => {
    useGamification.mockReturnValue({
      gamStats: {
        streak: { current: 5, multiplier: 1.5, lastPracticeDate: '2020-01-01' },
      },
    });
    render(<StreakCounter />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('should show "day streak" label when not compact', () => {
    useGamification.mockReturnValue({
      gamStats: {
        streak: { current: 3, multiplier: 1.0, lastPracticeDate: '2020-01-01' },
      },
    });
    render(<StreakCounter compact={false} />);
    expect(screen.getByText('day streak')).toBeInTheDocument();
  });

  it('should hide "day streak" label when compact', () => {
    useGamification.mockReturnValue({
      gamStats: {
        streak: { current: 3, multiplier: 1.0, lastPracticeDate: '2020-01-01' },
      },
    });
    render(<StreakCounter compact />);
    expect(screen.queryByText('day streak')).toBeNull();
  });

  it('should display multiplier when > 1.0', () => {
    useGamification.mockReturnValue({
      gamStats: {
        streak: { current: 7, multiplier: 1.5, lastPracticeDate: '2020-01-01' },
      },
    });
    render(<StreakCounter />);
    expect(screen.getByText('1.5x')).toBeInTheDocument();
  });

  it('should not display multiplier when 1.0', () => {
    useGamification.mockReturnValue({
      gamStats: {
        streak: { current: 1, multiplier: 1.0, lastPracticeDate: '2020-01-01' },
      },
    });
    render(<StreakCounter />);
    expect(screen.queryByText('1x')).toBeNull();
  });

  it('should render nothing in compact mode with 0 streak', () => {
    useGamification.mockReturnValue({
      gamStats: {
        streak: { current: 0, multiplier: 1.0, lastPracticeDate: null },
      },
    });
    const { container } = render(<StreakCounter compact />);
    expect(container.firstChild).toBeNull();
  });

  it('should default streak to 0 when streak data is missing', () => {
    useGamification.mockReturnValue({
      gamStats: {},
    });
    render(<StreakCounter />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
