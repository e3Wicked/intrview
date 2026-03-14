CREATE TABLE IF NOT EXISTS webhook_events (
  event_id VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_webhook_events_processed_at ON webhook_events (processed_at);
