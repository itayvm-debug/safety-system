# הוראות בדיקת Production — SafeDoc 1.0.0

**תאריך:** 2026-07-20  
**מחבר:** סשן סגירה סופי  

> ⚠️ כל הפעולות כאן הן **READ-ONLY** בסביבת Production — אלא אם כן מוצהר אחרת.  
> אין לבצע git push, deploy, שינוי ב-Vercel Production, הרצת SQL שמשנה מידע.

---

## שלב 1 — פתיחת Supabase SQL Editor

1. כנס ל-[supabase.com](https://supabase.com) → הפרויקט שלך
2. בסרגל שמאל: **SQL Editor**
3. לחץ על `+ New query`
4. העתק את תוכן `supabase/predeploy_production_state_check.sql`
5. לחץ **Run** (לא `Run selected` — להריץ הכל)

---

## שלב 2 — פענוח התוצאות

עבור כל שאילתה, קרא את עמודת `status`:

### ✅ תוצאה תקינה לפני deploy

| check_name | status ציפוי |
|------------|--------------|
| legal_acceptances | PRESENT |
| audit_logs | PRESENT |
| legal_acceptances.privacy_version EXISTS | PRESENT |
| legal_acceptances.privacy_version NOT NULL | PRESENT |
| unique index ... | PRESENT |
| entity_notes | PRESENT |
| workers.is_archived | PRESENT |
| vehicles.is_archived | PRESENT |
| heavy_equipment.is_archived | PRESENT |
| lifting_equipment.is_archived | PRESENT |
| subcontractors.is_archived | PRESENT |
| rate_limit_events table | PRESENT |
| rate_limit_check() function | PRESENT |
| rate_limit_cleanup() function | PRESENT |
| כל הטבלאות הקריטיות — RLS | PRESENT — RLS מופעל |
| storage bucket worker-files | PRESENT |
| storage bucket worker-files private | PRESENT — private (תקין) |

### ❌ תוצאות חוסמות

| status שנראה | פעולה נדרשת |
|-------------|-------------|
| MISSING — entity_notes | הרץ `migrations/phase2_fixes.sql` → **שלב 3** |
| MISSING — rate_limit_events | הרץ `migrations/durable-rate-limiting.sql` → **שלב 4** |
| INVALID — column is NULLABLE | הרץ migration_legal_acceptances_dedup_and_unique שוב (כנראה לא הורץ) |
| INVALID — bucket ציבורי | עבור לStorage → עדכן public=false → **שלב 5** |
| INVALID — RLS כבוי | הפעל RLS ידנית → `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;` |

---

## שלב 3 — הרצת phase2_fixes.sql (אם MISSING)

**לבצע רק אם entity_notes = MISSING או workers.is_archived = MISSING.**

1. פתח `migrations/phase2_fixes.sql`
2. SQL Editor → New query → הדבק → Run
3. אמת: הרץ שוב `predeploy_production_state_check.sql`
4. ודא: `entity_notes = PRESENT`, `workers.is_archived = PRESENT`, וכן הלאה

**ציפייה לתוצאה:** כל `is_archived` + `entity_notes` → PRESENT

---

## שלב 4 — הרצת durable-rate-limiting.sql (אם MISSING)

**לבצע רק אם rate_limit_events = MISSING.**

1. פתח `migrations/durable-rate-limiting.sql`
2. SQL Editor → New query → הדבק → Run
3. אמת: הרץ שוב predeploy
4. ודא: `rate_limit_events = PRESENT`, `rate_limit_check = PRESENT`, `rate_limit_cleanup = PRESENT`

**לאחר הרצה מוצלחת:**
- ערוך `config/features.ts`
- שנה: `durableRateLimitingEnabled: false` → `durableRateLimitingEnabled: true`
- כלל שינוי זה ב-commit לפני deploy

---

## שלב 5 — Storage Bucket (אם INVALID/MISSING)

**אם bucket לא קיים:**
1. Supabase Dashboard → **Storage** → **New bucket**
2. Name: `worker-files`
3. Public: **OFF** (חובה — private)
4. Region: `ap-northeast-1` (ממליץ לשמור עקביות)

**אם bucket ציבורי:**
1. Storage → `worker-files` → Settings (אייקון גלגל שיניים)
2. כבה **Public** → שמור

---

## שלב 6 — בדיקת Environment Variables ב-Vercel

לפני deploy, ודא שכל המשתנים הנדרשים מוגדרים ב-Vercel:

1. Vercel Dashboard → Project → **Settings → Environment Variables**
2. ודא קיום:

```
SESSION_SECRET             (חובה, ≥32 תווים)
SUPABASE_SERVICE_ROLE_KEY  (חובה)
NEXT_PUBLIC_SUPABASE_URL   (חובה)
NEXT_PUBLIC_SUPABASE_ANON_KEY (חובה)
NEXT_PUBLIC_APP_URL        (חובה, Production URL בלבד)
NEXT_PUBLIC_CUSTOMER_NAME  (חובה)
```

3. משתנים שאפשר להוסיף כאן:

```
NEXT_PUBLIC_BUILD_DATE     (מומלץ — מוצג ב-/about)
```

פורמט: `YYYY-MM-DD`, לדוגמה `2026-07-20`

> **⚠️ אל תוסיף `COOKIE_SECRET`** — שם שגוי. הקוד משתמש ב-`SESSION_SECRET`.

---

## שלב 7 — Deploy

**רק לאחר שכל שלבי 1-6 הושלמו ללא MISSING/INVALID:**

1. ב-terminal המקומי:
   ```
   git status          # ודא אין שינויים לא committed
   git log --oneline   # ודא הכל committed
   ```

2. אם שינית `config/features.ts` (durableRateLimitingEnabled):
   ```
   git add config/features.ts
   git commit -m "feat: enable durable rate limiting after migration"
   ```

3. Push ו-Deploy:
   ```
   git push
   ```
   Vercel יפתח Deploy אוטומטית.

4. המתן להשלמת Deploy ב-Vercel Dashboard.

---

## שלב 8 — Smoke Tests לאחר Deploy

לאחר שה-deploy הסתיים, בדוק את הפונקציות הבאות ב-browser:

### ✅ Public routes (ללא login)
- `GET /` → redirect ל-`/login` (200 + לוגין)
- `GET /login` → עמוד לוגין מוצג
- `GET /terms` → עמוד תנאי שימוש
- `GET /privacy` → עמוד פרטיות
- `GET /about` → מציג גרסה, SCHEMA_VERSION, BUILD_DATE
- `GET /api/health` → JSON `{"status": "ok"}` (לא redirect!)

### ✅ API returns 401 (ללא session)
בדוק ב-browser DevTools → Network:
- `GET /api/workers` → 401 JSON (לא 302)
- `GET /api/admin/export` → 401 JSON

### ✅ Login flow
1. כנס עם משתמש קיים
2. ודא הגעת ל-Dashboard
3. Dashboard מציג 4 stat boxes
4. `/about` → SCHEMA_VERSION מוצג נכון

### ✅ Admin Export (כ-Admin)
1. כנס כ-Admin
2. `/settings/export` או `/admin`
3. לחץ Export → קובץ ZIP מורד
4. בדוק שה-ZIP מכיל CSVs

### ✅ Health check
```
curl https://your-app.vercel.app/api/health
# ציפייה: {"status":"ok"} עם Content-Type: application/json
```

---

## שלב 9 — מה לא לבדוק ב-Production

| נושא | סיבה |
|------|-------|
| מספרי זהות, פרטי עובדים | אסור לחשוף PII |
| תוכן דוחות | מסמכים פנימיים |
| מחיקת נתוני Production | אסור לחלוטין |

---

## תרשים זרימה — סיכום שלבים

```
1. הרץ predeploy SQL (READ-ONLY)
         ↓
2. כל PRESENT?
   ├── כן → שלב 6 (Env Vars)
   └── לא → בדוק מה MISSING:
       ├── entity_notes MISSING → שלב 3 → חזור ל-1
       ├── rate_limit_events MISSING → שלב 4 → חזור ל-1
       ├── bucket INVALID → שלב 5 → חזור ל-1
       └── RLS INVALID → ALTER TABLE ENABLE RLS → חזור ל-1
         ↓
6. ודא Env Vars ב-Vercel
         ↓
7. Deploy
         ↓
8. Smoke Tests
         ↓
   DONE ✅
```

---

## קבצי עזר

| קובץ | תוכן |
|------|------|
| `supabase/predeploy_production_state_check.sql` | SQL לבדיקת Production state |
| `migrations/phase2_fixes.sql` | Migration B1 |
| `migrations/durable-rate-limiting.sql` | Migration C1 |
| `docs/release/FINAL_MIGRATION_MAP_HE.md` | פירוט כל migration |
| `docs/release/FINAL_ENVIRONMENT_VARIABLES_HE.md` | כל משתני הסביבה |
| `docs/release/FINAL_SESSION_CLOSURE_HE.md` | סיכום הסשן המלא |
