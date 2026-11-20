-- Read only. Expect: נתן ולדמן ובניו employeeReviews = true, 168 assignments, 0 reviews.
SELECT id, name, settings->'features'->'employeeReviews' AS employee_reviews
FROM public.companies WHERE id = '00000000-0000-0000-0000-000000000001';
