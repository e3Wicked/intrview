-- Add two-bucket credit columns to subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS job_analyses_remaining INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_analyses_monthly_allowance INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS training_credits_remaining INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS training_credits_monthly_allowance INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_lifetime_plan BOOLEAN DEFAULT false;

-- Backfill existing users based on their current plan
-- Free users: 3 analyses, 15 training credits (lifetime)
UPDATE subscriptions
SET job_analyses_remaining = 3,
    job_analyses_monthly_allowance = 0,
    training_credits_remaining = 15,
    training_credits_monthly_allowance = 0,
    is_lifetime_plan = true
WHERE plan = 'free';

-- Starter users: 10 analyses/mo, 150 training/mo
UPDATE subscriptions
SET job_analyses_remaining = 10,
    job_analyses_monthly_allowance = 10,
    training_credits_remaining = 150,
    training_credits_monthly_allowance = 150,
    is_lifetime_plan = false
WHERE plan = 'starter';

-- Pro users: 30 analyses/mo, 400 training/mo
UPDATE subscriptions
SET job_analyses_remaining = 30,
    job_analyses_monthly_allowance = 30,
    training_credits_remaining = 400,
    training_credits_monthly_allowance = 400,
    is_lifetime_plan = false
WHERE plan = 'pro';

-- Elite users: unlimited analyses, 800 training/mo
UPDATE subscriptions
SET job_analyses_remaining = 999999,
    job_analyses_monthly_allowance = -1,
    training_credits_remaining = 800,
    training_credits_monthly_allowance = 800,
    is_lifetime_plan = false
WHERE plan = 'elite';
