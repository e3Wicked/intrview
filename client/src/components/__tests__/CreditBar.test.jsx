import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CreditBar from '../CreditBar.jsx';

describe('CreditBar', () => {
  it('should render nothing when user is null', () => {
    const { container } = render(<CreditBar user={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('should display analyses remaining with monthly allowance', () => {
    const user = {
      jobAnalysesRemaining: 8,
      jobAnalysesMonthlyAllowance: 10,
      trainingCreditsRemaining: 100,
      trainingCreditsMonthlyAllowance: 150,
      isLifetimePlan: false,
    };
    render(<CreditBar user={user} />);
    expect(screen.getByText('Analyses')).toBeInTheDocument();
    expect(screen.getByText('8 / 10')).toBeInTheDocument();
  });

  it('should display unlimited analyses for unlimited allowance', () => {
    const user = {
      jobAnalysesRemaining: 5,
      jobAnalysesMonthlyAllowance: -1,
      trainingCreditsRemaining: 100,
      trainingCreditsMonthlyAllowance: 800,
      isLifetimePlan: false,
    };
    render(<CreditBar user={user} />);
    // Unlimited analyses show infinity symbol
    expect(screen.getByText('\u221E')).toBeInTheDocument();
  });

  it('should display training credits remaining', () => {
    const user = {
      jobAnalysesRemaining: 3,
      jobAnalysesMonthlyAllowance: 10,
      trainingCreditsRemaining: 120,
      trainingCreditsMonthlyAllowance: 150,
      isLifetimePlan: false,
    };
    render(<CreditBar user={user} />);
    expect(screen.getByText('Training')).toBeInTheDocument();
    expect(screen.getByText('120 / 150')).toBeInTheDocument();
  });

  it('should display lifetime credits without monthly allowance format', () => {
    const user = {
      jobAnalysesRemaining: 2,
      jobAnalysesMonthlyAllowance: 0,
      trainingCreditsRemaining: 10,
      trainingCreditsMonthlyAllowance: 0,
      isLifetimePlan: true,
      planDetails: { lifetimeJobAnalyses: 3, lifetimeTrainingCredits: 15 },
    };
    render(<CreditBar user={user} />);
    // Lifetime plans show just the remaining count without "/ allowance"
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('should render segment meters for non-zero allowances', () => {
    const user = {
      jobAnalysesRemaining: 5,
      jobAnalysesMonthlyAllowance: 10,
      trainingCreditsRemaining: 80,
      trainingCreditsMonthlyAllowance: 150,
      isLifetimePlan: false,
    };
    const { container } = render(<CreditBar user={user} />);
    const segments = container.querySelectorAll('.credit-segments');
    expect(segments.length).toBe(2); // One for analyses, one for training
  });

  it('should show reset date for non-lifetime plans', () => {
    const resetDate = new Date('2026-04-01T00:00:00Z');
    const user = {
      jobAnalysesRemaining: 5,
      jobAnalysesMonthlyAllowance: 10,
      trainingCreditsRemaining: 80,
      trainingCreditsMonthlyAllowance: 150,
      isLifetimePlan: false,
      creditsResetAt: resetDate.toISOString(),
    };
    render(<CreditBar user={user} />);
    expect(screen.getByText(/Resets/)).toBeInTheDocument();
  });

  it('should not show reset date for lifetime plans', () => {
    const user = {
      jobAnalysesRemaining: 2,
      jobAnalysesMonthlyAllowance: 0,
      trainingCreditsRemaining: 10,
      trainingCreditsMonthlyAllowance: 0,
      isLifetimePlan: true,
      creditsResetAt: '2026-04-01T00:00:00Z',
    };
    render(<CreditBar user={user} />);
    expect(screen.queryByText(/Resets/)).toBeNull();
  });

  it('should show tooltip on hover', () => {
    const user = {
      jobAnalysesRemaining: 5,
      jobAnalysesMonthlyAllowance: 10,
      trainingCreditsRemaining: 80,
      trainingCreditsMonthlyAllowance: 150,
      isLifetimePlan: false,
    };
    const { container } = render(<CreditBar user={user} />);
    const bar = container.querySelector('.credit-bar');
    fireEvent.mouseEnter(bar);
    expect(screen.getByText(/Analyses are used for job postings/)).toBeInTheDocument();
    fireEvent.mouseLeave(bar);
    expect(screen.queryByText(/Analyses are used for job postings/)).toBeNull();
  });
});
