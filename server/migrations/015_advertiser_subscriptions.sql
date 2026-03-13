CREATE TABLE IF NOT EXISTS advertiser_subscriptions (
  id SERIAL PRIMARY KEY,
  advertiser_id INTEGER REFERENCES advertisers(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255) UNIQUE,
  contact_email VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  payment_failed_at TIMESTAMP,
  grace_period_end TIMESTAMP,
  dunning_emails_sent INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adv_sub_stripe_sub_id ON advertiser_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_adv_sub_status ON advertiser_subscriptions(status);
