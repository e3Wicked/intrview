-- Add company_name and role_title to study_plans for cross-user matching

ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS role_title VARCHAR(255);
