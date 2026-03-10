import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PricingSection from '../PricingSection.jsx';

describe('PricingSection', () => {
  const defaultProps = {
    onSelectPlan: vi.fn(),
    onManageBilling: vi.fn(),
  };

  it('should render all three plan cards', () => {
    render(<PricingSection {...defaultProps} />);
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Elite')).toBeInTheDocument();
  });

  it('should show normal CTAs for free user (no currentPlan)', () => {
    render(<PricingSection {...defaultProps} />);
    expect(screen.getByText('Start Starter')).toBeInTheDocument();
    expect(screen.getByText('Go Pro')).toBeInTheDocument();
    expect(screen.getByText('Join Elite')).toBeInTheDocument();
  });

  it('should show "Current Plan" for starter user on starter card', () => {
    render(<PricingSection {...defaultProps} currentPlan="starter" />);

    const currentBtns = screen.getAllByText('Current Plan');
    // One is the badge, one is the button
    expect(currentBtns.length).toBe(2);

    // Starter button should be disabled
    const starterBtn = currentBtns.find(el => el.tagName === 'BUTTON');
    expect(starterBtn).toBeDisabled();
  });

  it('should show upgrade CTAs for plans above current plan', () => {
    render(<PricingSection {...defaultProps} currentPlan="starter" />);
    expect(screen.getByText('Go Pro')).toBeInTheDocument();
    expect(screen.getByText('Join Elite')).toBeInTheDocument();
  });

  it('should show "Manage in Billing" for plans below current plan', () => {
    render(<PricingSection {...defaultProps} currentPlan="pro" />);
    expect(screen.getByText('Manage in Billing')).toBeInTheDocument();
  });

  it('should show "Manage in Billing" for all lower plans when on elite', () => {
    render(<PricingSection {...defaultProps} currentPlan="elite" />);
    const manageBtns = screen.getAllByText('Manage in Billing');
    expect(manageBtns.length).toBe(2); // starter and pro
  });

  it('should add .current CSS class to current plan card', () => {
    const { container } = render(<PricingSection {...defaultProps} currentPlan="pro" />);
    const currentCard = container.querySelector('.pricing-card.current');
    expect(currentCard).not.toBeNull();
    expect(currentCard.querySelector('h3').textContent).toBe('Pro');
  });

  it('should call onSelectPlan when clicking upgrade CTA', () => {
    const onSelectPlan = vi.fn();
    render(<PricingSection {...defaultProps} onSelectPlan={onSelectPlan} currentPlan="starter" />);
    fireEvent.click(screen.getByText('Go Pro'));
    expect(onSelectPlan).toHaveBeenCalledWith('pro');
  });

  it('should call onManageBilling when clicking "Manage in Billing"', () => {
    const onManageBilling = vi.fn();
    render(<PricingSection {...defaultProps} onManageBilling={onManageBilling} currentPlan="pro" />);
    fireEvent.click(screen.getByText('Manage in Billing'));
    expect(onManageBilling).toHaveBeenCalledTimes(1);
  });

  it('should not call onSelectPlan when clicking disabled "Current Plan" button', () => {
    const onSelectPlan = vi.fn();
    render(<PricingSection {...defaultProps} onSelectPlan={onSelectPlan} currentPlan="starter" />);
    const currentBtn = screen.getAllByText('Current Plan').find(el => el.tagName === 'BUTTON');
    fireEvent.click(currentBtn);
    expect(onSelectPlan).not.toHaveBeenCalled();
  });

  it('should show "Most Popular" badge on Pro when not current plan', () => {
    render(<PricingSection {...defaultProps} currentPlan="starter" />);
    expect(screen.getByText('Most Popular')).toBeInTheDocument();
  });

  it('should hide "Most Popular" badge on Pro when it is the current plan', () => {
    render(<PricingSection {...defaultProps} currentPlan="pro" />);
    expect(screen.queryByText('Most Popular')).toBeNull();
  });

  it('should treat undefined currentPlan same as free', () => {
    render(<PricingSection {...defaultProps} currentPlan={undefined} />);
    // All buttons should be normal CTAs (no "Current Plan" or "Manage in Billing")
    expect(screen.getByText('Start Starter')).toBeInTheDocument();
    expect(screen.getByText('Go Pro')).toBeInTheDocument();
    expect(screen.getByText('Join Elite')).toBeInTheDocument();
    expect(screen.queryByText('Current Plan')).toBeNull();
    expect(screen.queryByText('Manage in Billing')).toBeNull();
  });
});
