-- Owner request 2026-11-20: hide "ביצועי עובדים" (168 assignments, 0 reviews ever submitted).
-- Turns the existing per-company feature flag off: nav link, /reviews pages, the reminder and
-- snapshot crons all check it. No data is deleted (assignments/reviews stay).
-- Same as: admin → companies → נתן ולדמן → settings → "משוב עובדים" off.
UPDATE public.companies
SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{features,employeeReviews}', 'false'::jsonb, true)
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND settings->'features'->>'employeeReviews' = 'true';
