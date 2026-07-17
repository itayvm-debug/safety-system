-- ================================================================
-- SafeDoc Session 1 — Legal, Privacy, Security Foundation
-- migration_session1_legal_security.sql
-- idempotent — בטוח להרצה חוזרת (CREATE TABLE IF NOT EXISTS, IF NOT EXISTS)
-- ⚠️ הרץ ב-Supabase SQL Editor לאחר בדיקה
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. טבלת הסכמות משפטיות (legal_acceptances)
--    append-only: אין UPDATE/DELETE
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  user_email        TEXT        NOT NULL,
  terms_version     TEXT        NOT NULL,              -- גרסת תנאים (למשל '1.0-draft')
  accepted_terms    BOOLEAN     NOT NULL DEFAULT true,
  accepted_privacy  BOOLEAN     NOT NULL DEFAULT true,
  ip_address        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  -- אין updated_at — append-only
);

-- UNIQUE: רשומה אחת בלבד לכל משתמש+גרסה (NULL בuser_id לא נחסם — PostgreSQL לא משווה NULL=NULL)
CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_user_version_uidx
  ON legal_acceptances(user_id, terms_version);

CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx
  ON legal_acceptances(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS legal_acceptances_version_idx
  ON legal_acceptances(terms_version);

ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;

-- service_role בלבד: INSERT (API route לאחר auth) + SELECT own
DROP POLICY IF EXISTS "legal_acceptances_service_insert" ON legal_acceptances;
CREATE POLICY "legal_acceptances_service_insert"
  ON legal_acceptances FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "legal_acceptances_select_own" ON legal_acceptances;
CREATE POLICY "legal_acceptances_select_own"
  ON legal_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- אין UPDATE/DELETE policies — append-only by design

-- ──────────────────────────────────────────────────────────────────
-- 2. טבלת audit logs
--    append-only: אין UPDATE/DELETE
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  user_email   TEXT,
  action       TEXT        NOT NULL,    -- 'worker.create', 'login', etc.
  entity_type  TEXT,
  entity_id    UUID,
  metadata     JSONB,
  ip_address   TEXT
  -- אין updated_at — append-only
);

-- אינדקסים לביצועים — /admin/audit צד המשתמש
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx
  ON audit_logs(user_id);

CREATE INDEX IF NOT EXISTS audit_logs_action_idx
  ON audit_logs(action);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON audit_logs(entity_type, entity_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- service_role בלבד: INSERT
DROP POLICY IF EXISTS "audit_logs_service_insert" ON audit_logs;
CREATE POLICY "audit_logs_service_insert"
  ON audit_logs FOR INSERT TO service_role WITH CHECK (true);

-- admin: SELECT (לדף /admin/audit — מתבצע ב-service_role כך שה-policy אינה בשימוש)
-- service_role עוקף RLS — אין צורך ב-SELECT policy למעשה
-- אבל מוסיפים מניעת גישה ישירה:
-- (אין SELECT policy = authenticated לא יכולים לקרוא ישירות)

-- ──────────────────────────────────────────────────────────────────
-- 3. RLS על טבלאות שחסר להן — vehicles ואחרים
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicles_authenticated" ON vehicles;
CREATE POLICY "vehicles_authenticated"
  ON vehicles FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS vehicle_licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_licenses_authenticated" ON vehicle_licenses;
CREATE POLICY "vehicle_licenses_authenticated"
  ON vehicle_licenses FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS vehicle_insurances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_insurances_authenticated" ON vehicle_insurances;
CREATE POLICY "vehicle_insurances_authenticated"
  ON vehicle_insurances FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS heavy_equipment_insurances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "heavy_equipment_insurances_authenticated" ON heavy_equipment_insurances;
CREATE POLICY "heavy_equipment_insurances_authenticated"
  ON heavy_equipment_insurances FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS manager_licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_licenses_authenticated" ON manager_licenses;
CREATE POLICY "manager_licenses_authenticated"
  ON manager_licenses FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────
-- 4. authorized_phones — מניעת שינוי ישיר ע"י authenticated
--    (רק service_role יכול לשנות)
-- ──────────────────────────────────────────────────────────────────

-- הסר policy ישנה שמאפשרת ALL
DROP POLICY IF EXISTS "authenticated users can read authorized_phones" ON authorized_phones;

-- Policy חדשה: SELECT בלבד ל-authenticated
DROP POLICY IF EXISTS "authorized_phones_select" ON authorized_phones;
CREATE POLICY "authorized_phones_select"
  ON authorized_phones FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE — service_role בלבד (ברירת מחדל ב-Supabase)

-- ──────────────────────────────────────────────────────────────────
-- 5. profiles — מניעת שינוי role/is_active ישיר ע"י authenticated
-- ──────────────────────────────────────────────────────────────────

-- כבר יש policy SELECT own — זה מספיק כי כל writes עוברים service_role

-- ──────────────────────────────────────────────────────────────────
-- סיכום:
-- הרצת migration זה:
-- 1. יוצרת legal_acceptances + audit_logs
-- 2. מפעילה RLS על טבלאות שחסר
-- 3. מחמירה הרשאות authorized_phones
-- ================================================================
