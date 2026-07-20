# מפת Migrations — SafeDoc 1.0.0

**עדכון אחרון:** 2026-07-20  
**מחבר:** סשן סגירה סופי

---

## A. כבר הורצו ב-Production (אל תרוץ שוב)

### A1: migration_session1_legal_security.sql

| שדה | ערך |
|-----|-----|
| **מטרה** | יצירת legal_acceptances, audit_logs, RLS policies |
| **תלות** | ללא — migration ראשון |
| **מה נוצר** | טבלאות: `legal_acceptances`, `audit_logs`; RLS על כל הטבלאות הקריטיות |
| **האם מותר חזרה** | כן (IF NOT EXISTS לכל פקודה) |
| **verification** | `SELECT count(*) FROM legal_acceptances;` — אמור להחזיר שורות |
| **rollback** | `DROP TABLE IF EXISTS audit_logs; DROP TABLE IF EXISTS legal_acceptances;` — ⚠️ מוחק נתונים |

### A2: migration_legal_acceptances_dedup_and_unique.sql

| שדה | ערך |
|-----|-----|
| **מטרה** | הוספת `privacy_version NOT NULL`, הסרת כפילויות, יצירת unique index |
| **תלות** | A1 — legal_acceptances חייבת להתקיים |
| **מה נוצר** | עמודה `privacy_version TEXT NOT NULL`; index `legal_acceptances_user_terms_privacy_uidx` |
| **האם מותר חזרה** | לא — ALTER column ו-INSERT ON CONFLICT עלולים לכשול על נתונים קיימים |
| **verification** | `SELECT is_nullable FROM information_schema.columns WHERE table_name='legal_acceptances' AND column_name='privacy_version';` → `NO` |
| **rollback** | `ALTER TABLE legal_acceptances DROP COLUMN privacy_version; DROP INDEX legal_acceptances_user_terms_privacy_uidx;` |

---

## B. לבדוק מול Production State Check לפני הרצה

### B1: migrations/phase2_fixes.sql

| שדה | ערך |
|-----|-----|
| **מטרה** | יצירת `entity_notes`; הוספת `is_archived BOOLEAN DEFAULT false` לכל ישות |
| **תלות** | A1 (RLS patterns), אין תלות קריטית אחרת |
| **טבלאות שנוגעות** | `workers`, `vehicles`, `heavy_equipment`, `lifting_equipment`, `subcontractors` — הוספת עמודה; יצירת `entity_notes` |
| **מה נוצר** | עמודת `is_archived` בכל הטבלאות לעיל; טבלת `entity_notes` |
| **preview** | `ALTER TABLE workers ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;` |
| **האם מותר חזרה** | כן (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) |
| **verification** | `SELECT column_name FROM information_schema.columns WHERE table_name='workers' AND column_name='is_archived';` |
| **rollback** | `ALTER TABLE workers DROP COLUMN IF EXISTS is_archived;` (×5 tables) + `DROP TABLE IF EXISTS entity_notes;` |
| **מה אסור שיימחק** | נתוני עובדים, רכבים, ציוד הרמה, צמ"ה, קבלני משנה |
| **מתי להריץ** | **לפני deploy** — הקוד מניח קיום `is_archived` ו-`entity_notes` |

---

## C. Pending חדש — לא הורץ עדיין

### C1: migrations/durable-rate-limiting.sql

| שדה | ערך |
|-----|-----|
| **מטרה** | rate limiting עמיד בין Vercel instances — Postgres במקום in-memory Map |
| **תלות** | ללא תלות בטבלאות אחרות. RLS מוגדר בתוך ה-migration |
| **מה נוצר** | טבלת `rate_limit_events (key_hash TEXT, window_start BIGINT, count INT, PK)` |
| | פונקציה `rate_limit_check(p_key_hash, p_window_ms, p_max_count)` — SECURITY DEFINER |
| | פונקציה `rate_limit_cleanup(max_age_ms)` — למחיקת חלונות ישנים |
| | RLS policy `rate_limit_service_only` — service_role בלבד |
| | Index `idx_rate_limit_window_start` — לניקוי מהיר |
| **preview** | `CREATE TABLE IF NOT EXISTS rate_limit_events(key_hash TEXT, window_start BIGINT, count INT DEFAULT 1, PRIMARY KEY (key_hash, window_start));` |
| **האם מותר חזרה** | כן (`IF NOT EXISTS` ו-`CREATE OR REPLACE FUNCTION`) |
| **verification** | `SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_name IN ('rate_limit_check','rate_limit_cleanup');` → שתי שורות |
| **rollback** | `DROP FUNCTION IF EXISTS rate_limit_cleanup(BIGINT); DROP FUNCTION IF EXISTS rate_limit_check(TEXT,BIGINT,INT); DROP TABLE IF EXISTS rate_limit_events CASCADE;` |
| **מה אסור שיימחק** | אין נתונים עסקיים — הטבלה מכילה counters זמניים בלבד |
| **מתי להריץ** | **לפני deploy** — login rate limiting fail-open ללא migration |
| **אחרי הרצה** | עדכן `FEATURES.durableRateLimitingEnabled = true` ב-`config/features.ts` |

---

## סיכום סדר הרצה לפני Deploy

```
1. בדוק predeploy_production_state_check.sql — מה חסר
2. אם phase2_fixes → MISSING: הרץ B1
3. אם rate_limit_events → MISSING: הרץ C1
4. הרץ predeploy שוב — ודא PRESENT על הכל
5. Deploy
```

> **חשוב:** A1 ו-A2 כבר הורצו. אל תריץ אותם שוב.
