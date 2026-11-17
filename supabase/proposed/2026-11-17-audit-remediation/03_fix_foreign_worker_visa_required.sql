-- ================================================================
-- PROPOSED, NOT RUN. Data correction for P0-4.
-- The code now treats a foreign worker's work visa as required whatever the
-- stored flag says, and switching a worker to "foreign" now sets the flag.
-- This aligns rows written before the fix. Only is_required on work_visa rows
-- of foreign workers changes; files and expiry dates are untouched.
-- Run query 8 of 01_verify_live_state.sql first and note the count.
-- ================================================================
BEGIN;

UPDATE documents d
SET is_required = true, updated_at = now()
FROM workers w
WHERE w.id = d.worker_id
  AND w.company_id = d.company_id
  AND d.doc_type = 'work_visa'
  AND d.is_required = false
  AND w.is_foreign_worker;

-- The reported row count must equal the total of query 8. Then:
-- COMMIT;   -- or ROLLBACK;
