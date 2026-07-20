# סדר הרצת SQL Migrations — SafeDoc
> תאריך: 2026-07-18 | גרסה: 1.0 | סיווג: פנימי

## חשוב מאד

⚠️ **הרץ migrations רק על DB שטרם מכיל נתוני production**
⚠️ **לגבי DB קיים עם נתונים — השתמש ב-migrations incremental בלבד**
⚠️ **אין להריץ SQL על Supabase Production ללא גיבוי מוקדם**

---

## סדר הרצה עבור פרויקט חדש (new deployment)

הרץ כל קובץ ב-Supabase Dashboard → SQL Editor בסדר הבא:

| # | קובץ | תיאור |
|---|------|-------|
| 1 | `supabase/migrations/[timestamp]_initial_schema.sql` | טבלאות בסיס |
| 2 | `supabase/migrations/[timestamp]_rls_policies.sql` | RLS policies |
| 3 | `supabase/migrations/[timestamp]_profiles.sql` | פרופילי משתמשים |
| 4 | `supabase/migrations/[timestamp]_legal_acceptances.sql` | legal_acceptances |
| 5 | `supabase/migrations/[timestamp]_audit_logs.sql` | audit logs |
| 6 | `supabase/migration_legal_acceptances_dedup_and_unique.sql` | Dedup + unique index |

> **שים לב**: שמות הקבצים בפועל מכילים timestamp. הרץ לפי סדר ה-timestamp (ASC).

---

## סדר הרצה עבור DB קיים (incremental migration)

1. ודא שיש גיבוי עדכני (Supabase PITR / snapshot)
2. הרץ תחילה `supabase/preview_legal_acceptances_dedup.sql` (SELECT-only, לאימות)
3. לאחר אימות תקין — הרץ `supabase/migration_legal_acceptances_dedup_and_unique.sql`
4. ודא שאין שגיאות
5. בדוק `/api/admin/system-health` → database: ok

---

## בדיקות לאחר migration

```sql
-- ודא שהעמודות קיימות
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'legal_acceptances'
ORDER BY ordinal_position;

-- ודא שה-unique index קיים
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'legal_acceptances';

-- ספור רשומות
SELECT COUNT(*) FROM legal_acceptances;
SELECT COUNT(*) FROM profiles;
SELECT COUNT(*) FROM workers;
```

---

## אזהרות ידועות

- migration `_dedup_and_unique` כולל DELETE לכפילויות — **לא הפיך**
- אם migration נכשל — בדוק את הלוג לפני ניסיון חוזר
- ב-Supabase Free: אין PITR — בצע manual backup לפני כל migration

---

## לוג ביצוע migrations

| תאריך | פרויקט/לקוח | Migration | תוצאה | הערות |
|-------|------------|-----------|-------|-------|
| 2026-07-18 | dev/staging | initial setup | — | הקמה ראשונית |
