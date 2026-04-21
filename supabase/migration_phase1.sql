-- ============================================================
-- Phase 1: Data Model Cleanup
-- ============================================================

-- 1. UNIQUE constraint: מניעת כפילות מספר רכב
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_vehicle_number_unique UNIQUE (vehicle_number);

-- 2. הסרת UNIQUE constraint ישן על manager_licenses + vehicle_number (אם קיים)
--    (רשומות ה-'רישיון רכב' הישנות נשארות כ-historical data ואינן בשימוש)

-- 3. Deprecation note לטבלת manager_insurances
COMMENT ON TABLE manager_insurances IS
  'DEPRECATED: vehicle insurances moved to vehicle_insurances table. No new writes.';
