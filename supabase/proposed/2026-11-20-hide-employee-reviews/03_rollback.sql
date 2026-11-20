-- Turn the feature back on (value before 2026-11-20 was true).
UPDATE public.companies
SET settings = jsonb_set(settings, '{features,employeeReviews}', 'true'::jsonb, true)
WHERE id = '00000000-0000-0000-0000-000000000001';
