import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { useState, useEffect } from 'react';
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom';

// Mock axios
const mockAxiosGet = vi.fn();
vi.mock('axios', () => ({
  default: {
    get: (...args) => mockAxiosGet(...args),
    defaults: { headers: { common: {} } },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const RETRY_DELAY = 10; // Short delay for tests (production uses 1500ms)

/**
 * Minimal component that replicates the upgrade polling logic from App.jsx.
 * This isolates the useEffect under test without needing to render the full App.
 * Uses a short retry delay to keep tests fast.
 */
function UpgradePollingHarness({ onUserUpdate }) {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('upgraded') !== 'true') return;

    let cancelled = false;

    const refreshUser = async (retries = 5) => {
      for (let i = 0; i < retries && !cancelled; i++) {
        try {
          await mockAxiosGet('/api/stripe/verify-checkout');
          const res = await mockAxiosGet('/api/auth/me');
          if (res.data.user && res.data.user.plan !== 'free') {
            setUser(res.data.user);
            onUserUpdate?.(res.data.user);
            navigate(location.pathname, { replace: true });
            return;
          }
        } catch {}
        if (i < retries - 1) await new Promise(r => setTimeout(r, RETRY_DELAY));
      }
      navigate(location.pathname, { replace: true });
    };

    refreshUser();
    return () => { cancelled = true; };
  }, [location.search]);

  return <div data-testid="plan">{user?.plan || 'none'}</div>;
}

function renderWithRouter(initialPath) {
  const onUserUpdate = vi.fn();
  const result = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <UpgradePollingHarness onUserUpdate={onUserUpdate} />
    </MemoryRouter>
  );
  return { ...result, onUserUpdate };
}

describe('Upgrade polling after Stripe checkout', () => {
  it('should not call verify-checkout when upgraded param is absent', () => {
    renderWithRouter('/dashboard');
    expect(mockAxiosGet).not.toHaveBeenCalledWith('/api/stripe/verify-checkout');
  });

  it('should not call verify-checkout when upgraded param is not true', () => {
    renderWithRouter('/dashboard?upgraded=false');
    expect(mockAxiosGet).not.toHaveBeenCalledWith('/api/stripe/verify-checkout');
  });

  it('should call verify-checkout then auth/me when upgraded=true', async () => {
    mockAxiosGet
      .mockResolvedValueOnce({ data: { plan: 'starter', updated: true } })   // verify-checkout
      .mockResolvedValueOnce({ data: { user: { plan: 'starter', id: 1 } } }); // auth/me

    await act(async () => {
      renderWithRouter('/dashboard?upgraded=true');
    });

    expect(mockAxiosGet).toHaveBeenCalledWith('/api/stripe/verify-checkout');
    expect(mockAxiosGet).toHaveBeenCalledWith('/api/auth/me');
  });

  it('should update user when plan is no longer free', async () => {
    mockAxiosGet
      .mockResolvedValueOnce({ data: { plan: 'pro', updated: true } })
      .mockResolvedValueOnce({ data: { user: { plan: 'pro', id: 1 } } });

    let result;
    await act(async () => {
      result = renderWithRouter('/dashboard?upgraded=true');
    });

    expect(result.onUserUpdate).toHaveBeenCalledWith({ plan: 'pro', id: 1 });
  });

  it('should retry when user plan is still free', async () => {
    // First attempt: still free
    mockAxiosGet
      .mockResolvedValueOnce({ data: { plan: 'free', updated: false } })   // verify-checkout #1
      .mockResolvedValueOnce({ data: { user: { plan: 'free', id: 1 } } }) // auth/me #1
      // Second attempt: upgraded
      .mockResolvedValueOnce({ data: { plan: 'starter', updated: true } })   // verify-checkout #2
      .mockResolvedValueOnce({ data: { user: { plan: 'starter', id: 1 } } }); // auth/me #2

    await act(async () => {
      renderWithRouter('/dashboard?upgraded=true');
    });

    // Wait for retry to complete (short delay in test harness)
    await waitFor(() => {
      expect(mockAxiosGet).toHaveBeenCalledTimes(4);
    });
  });

  it('should handle verify-checkout API errors gracefully and retry', async () => {
    mockAxiosGet
      .mockRejectedValueOnce(new Error('Network error'))  // verify-checkout #1 fails
      // Retry succeeds
      .mockResolvedValueOnce({ data: { plan: 'starter', updated: true } })
      .mockResolvedValueOnce({ data: { user: { plan: 'starter', id: 1 } } });

    await act(async () => {
      renderWithRouter('/dashboard?upgraded=true');
    });

    // Wait for retry to complete
    await waitFor(() => {
      expect(mockAxiosGet).toHaveBeenCalledTimes(3);
    });
  });

  it('should stop retrying after cleanup (unmount)', async () => {
    // All attempts return free — will keep retrying
    mockAxiosGet.mockResolvedValue({ data: { user: { plan: 'free', id: 1 } } });

    let result;
    await act(async () => {
      result = renderWithRouter('/dashboard?upgraded=true');
    });

    // Unmount the component (triggers cleanup / cancelled = true)
    result.unmount();

    // Wait a bit, then verify no additional calls were made
    await new Promise(r => setTimeout(r, 50));
    const callCountAfterWait = mockAxiosGet.mock.calls.length;

    // Wait a bit more — should stay the same
    await new Promise(r => setTimeout(r, 50));
    expect(mockAxiosGet.mock.calls.length).toBe(callCountAfterWait);
  });
});
