-- Migration: הגדרת תבניות תדריך ספציפיות לחברת "נתן ולדמן ובניו בע"מ"
--
-- This sets company-specific briefing template overrides for Natan Valdman.
-- All other companies will automatically receive the SafeDoc default templates.
--
-- Run in Supabase SQL Editor.
-- SAFE to run multiple times (idempotent via jsonb_set with existing key).

UPDATE companies
SET settings = jsonb_set(
  COALESCE(settings, '{}'),
  '{briefingTemplates}',
  '{
    "hebrew":  "/briefing-templates/overrides/natan-valdman/hebrew.pdf",
    "arabic":  "/briefing-templates/overrides/natan-valdman/arabic.pdf",
    "english": "/briefing-templates/overrides/natan-valdman/english.pdf",
    "russian": "/briefing-templates/overrides/natan-valdman/russian.pdf",
    "thai":    "/briefing-templates/overrides/natan-valdman/thai.pdf"
  }'::jsonb,
  true
)
WHERE name ILIKE '%ולדמן%'
   OR name ILIKE '%valdman%';

-- Verify the update
SELECT id, name, settings->'briefingTemplates' AS briefing_templates
FROM companies
WHERE name ILIKE '%ולדמן%'
   OR name ILIKE '%valdman%';
