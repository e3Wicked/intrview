import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CreditBar from '../CreditBar.jsx';

describe('CreditBar', () => {
  it('should render nothing when user is null', () => {
    const { container } = render(<CreditBar user={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('should display credits remaining and total', () => {
    const user = { creditsRemaining: 10, creditsMonthlyAllowance: 15 };
    render(<CreditBar user={user} />);
    expect(screen.getByText('10 / 15')).toBeInTheDocument();
  });

  it('should display only remaining credits when allowance is 0', () => {
    const user = { creditsRemaining: 10, creditsMonthlyAllowance: 0 };
    render(<CreditBar user={user} />);
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('should not render progress bar when allowance is 0', () => {
    const user = { creditsRemaining: 10, creditsMonthlyAllowance: 0 };
    const { container } = render(<CreditBar user={user} />);
    expect(container.querySelector('.credit-progress')).toBeNull();
  });

  it('should render progress bar when allowance is positive', () => {
    const user = { creditsRemaining: 10, creditsMonthlyAllowance: 15 };
    const { container } = render(<CreditBar user={user} />);
    expect(container.querySelector('.credit-progress')).not.toBeNull();
  });

  it('should show upgrade button when credits are 0', () => {
    const onUpgrade = vi.fn();
    const user = { creditsRemaining: 0, creditsMonthlyAllowance: 15 };
    render(<CreditBar user={user} onUpgrade={onUpgrade} />);
    const btn = screen.getByText('Upgrade');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('should not show upgrade button when credits remain', () => {
    const user = { creditsRemaining: 5, creditsMonthlyAllowance: 15 };
    render(<CreditBar user={user} />);
    expect(screen.queryByText('Upgrade')).toBeNull();
  });

  it('should apply amber color when credits > 50%', () => {
    const user = { creditsRemaining: 10, creditsMonthlyAllowance: 15 };
    const { container } = render(<CreditBar user={user} />);
    const fill = container.querySelector('.credit-progress-fill');
    expect(fill.style.backgroundColor).toBe('rgb(245, 158, 11)'); // #f59e0b
  });

  it('should apply yellow color when credits 20-50%', () => {
    const user = { creditsRemaining: 5, creditsMonthlyAllowance: 15 };
    const { container } = render(<CreditBar user={user} />);
    const fill = container.querySelector('.credit-progress-fill');
    expect(fill.style.backgroundColor).toBe('rgb(251, 191, 36)'); // #fbbf24
  });

  it('should apply red color when credits <= 20%', () => {
    const user = { creditsRemaining: 1, creditsMonthlyAllowance: 15 };
    const { container } = render(<CreditBar user={user} />);
    const fill = container.querySelector('.credit-progress-fill');
    expect(fill.style.backgroundColor).toBe('rgb(239, 68, 68)'); // #ef4444
  });

  it('should show tooltip on hover', () => {
    const user = { creditsRemaining: 10, creditsMonthlyAllowance: 15 };
    const { container } = render(<CreditBar user={user} />);
    const info = container.querySelector('.credit-info');
    fireEvent.mouseEnter(info);
    expect(screen.getByText(/Prep credits power/)).toBeInTheDocument();
    fireEvent.mouseLeave(info);
    expect(screen.queryByText(/Prep credits power/)).toBeNull();
  });
});
