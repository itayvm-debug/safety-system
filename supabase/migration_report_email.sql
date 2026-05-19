-- Add report_email column to profiles
-- This is the real-world email address for sending weekly reports.
-- It is separate from the Supabase auth email (which may be an internal @safedoc.local address).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS report_email TEXT;
