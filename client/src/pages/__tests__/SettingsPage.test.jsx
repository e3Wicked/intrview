import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SettingsPage from '../SettingsPage.jsx';

// Mock axios to prevent real API calls
vi.mock('axios', () => ({
  default: { post: vi.fn() },
}));

// Mock the api utility
vi.mock('../../utils/api', () => ({
  api: { user: { updateProfile: vi.fn() } },
}));

const baseUser = {
  email: 'test@example.com',
  name: 'Test User',
  plan: 'free',
  jobAnalysesRemaining: 1,
  jobAnalysesMonthlyAllowance: 0,
  trainingCreditsRemaining: 10,
  trainingCreditsMonthlyAllowance: 0,
  isLifetimePlan: true,
};

describe('SettingsPage', () => {
  const defaultProps = {
    setUser: vi.fn(),
    onUpgrade: vi.fn(),
    onLogout: vi.fn(),
  };

  it('should show "Upgrade Plan" button for free user', () => {
    render(<SettingsPage {...defaultProps} user={{ ...baseUser, plan: 'free' }} />);
    expect(screen.getByText('Upgrade Plan')).toBeInTheDocument();
  });

  it('should show "Upgrade Plan" button for starter user', () => {
    render(<SettingsPage {...defaultProps} user={{ ...baseUser, plan: 'starter' }} />);
    expect(screen.getByText('Upgrade Plan')).toBeInTheDocument();
  });

  it('should show "Upgrade Plan" button for pro user', () => {
    render(<SettingsPage {...defaultProps} user={{ ...baseUser, plan: 'pro' }} />);
    expect(screen.getByText('Upgrade Plan')).toBeInTheDocument();
  });

  it('should hide "Upgrade Plan" button for elite user', () => {
    render(<SettingsPage {...defaultProps} user={{ ...baseUser, plan: 'elite' }} />);
    expect(screen.queryByText('Upgrade Plan')).toBeNull();
  });

  it('should show "Manage Billing" when user has stripeCustomerId', () => {
    render(
      <SettingsPage
        {...defaultProps}
        user={{ ...baseUser, plan: 'starter', stripeCustomerId: 'cus_123' }}
      />
    );
    expect(screen.getByText('Manage Billing')).toBeInTheDocument();
  });

  it('should hide "Manage Billing" when user has no stripeCustomerId', () => {
    render(<SettingsPage {...defaultProps} user={{ ...baseUser }} />);
    expect(screen.queryByText('Manage Billing')).toBeNull();
  });

  it('should display the correct plan label', () => {
    render(<SettingsPage {...defaultProps} user={{ ...baseUser, plan: 'pro' }} />);
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });

  it('should display plan label capitalized for free plan', () => {
    render(<SettingsPage {...defaultProps} user={{ ...baseUser, plan: 'free' }} />);
    expect(screen.getByText('Free')).toBeInTheDocument();
  });
});
