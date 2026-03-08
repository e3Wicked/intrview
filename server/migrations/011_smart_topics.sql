-- Add is_drillable column to topics table
ALTER TABLE topics ADD COLUMN IF NOT EXISTS is_drillable BOOLEAN DEFAULT TRUE;
