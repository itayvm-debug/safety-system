# בידוד זהות עובד במערכת רב-שוכרת

## כלל עסקי

אותו אדם פיזי יכול לעבוד בכמה חברות. המשמעות היא:

- חברה א' וחברה ב' רשאיות כל אחת לרשום עובד עם תעודת זהות `203530332`.
- אותה תעודת זהות **לא תופיע פעמיים באותה חברה**.

---

## הבעיה שזוהתה

קובץ `supabase/migration_worker_identity.sql` יצר אינדקסים ייחודיים **גלובליים**:

```sql
CREATE UNIQUE INDEX workers_national_id_unique
  ON workers (national_id)
  WHERE national_id IS NOT NULL;

CREATE UNIQUE INDEX workers_passport_number_unique
  ON workers (passport_number)
  WHERE passport_number IS NOT NULL;
```

אינדקסים אלה אוכפים ייחודיות **בכל החברות** — כלומר, אם חברה א' רשמה עובד עם ת"ז `X`, חברה ב' לא תוכל לרשום עובד עם אותה ת"ז. זה מנוגד לכלל העסקי.

שגיאת PostgreSQL: `23505 unique_violation`.

---

## הפתרון

### 1. שינוי אינדקס ה-DB — אינדקסים קומפוזיטיים

**קובץ הצעת מיגרציה:** `supabase/migration_worker_identity_isolation.sql`

```sql
-- הסרת האינדקסים הגלובליים
DROP INDEX IF EXISTS workers_national_id_unique;
DROP INDEX IF EXISTS workers_passport_number_unique;

-- יצירת אינדקסים קומפוזיטיים (company_id + identity field)
CREATE UNIQUE INDEX workers_company_national_id_unique
  ON workers (company_id, national_id)
  WHERE national_id IS NOT NULL;

CREATE UNIQUE INDEX workers_company_passport_number_unique
  ON workers (company_id, passport_number)
  WHERE passport_number IS NOT NULL;
```

האינדקסים החדשים מונעים כפילות **בתוך אותה חברה**, ומאפשרים אותה זהות **בחברות שונות**.

### 2. בדיקת כפילויות לפני מיגרציה

**קובץ preview:** `supabase/preview_worker_identity_isolation.sql`

לפני הרצת המיגרציה, הרץ את `preview_worker_identity_isolation.sql` ובדוק:
- שאילתה 3 (כפילויות `national_id` בתוך חברה) — חייב להחזיר 0 שורות.
- שאילתה 4 (כפילויות `passport_number` בתוך חברה) — חייב להחזיר 0 שורות.

המיגרציה עצמה כוללת גם בדיקת בטיחות (`DO $$ ... RAISE EXCEPTION`) שמבטלת את הביצוע אם מתגלות כפילויות.

### 3. שינויים בשכבת האפליקציה

#### `lib/workers/normalize.ts`

פונקציית נירמול לשדות זהות:

```typescript
export function normalizeIdentityValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}
```

כל INSERT ו-UPDATE משתמשים ב-`normalizeIdentityValue` לפני בדיקת כפילות ולפני שמירה ב-DB.

#### `app/api/workers/route.ts` — POST handler

בדיקת כפילות **מוגבלת לחברה המבקשת**:

```typescript
// בדיקת כפילות מוגבלת לחברה זו בלבד.
// אותה זהות בחברה אחרת — מותרת. אין לחשוף מידע חוצה-חברות.
const { data: existing } = await supabase
  .from('workers')
  .select('id')
  .eq('national_id', nationalIdNorm)
  .eq('company_id', companyId)   // ← חובה: סינון לפי company_id
  .maybeSingle();

if (existing) return NextResponse.json(
  { error: 'עובד עם מזהה זה כבר קיים בחברה' },  // "בחברה" לא "במערכת"
  { status: 409 }
);
```

#### `app/api/workers/[id]/route.ts` — PUT handler

בדיקת כפילות במהלך עדכון:

```typescript
// מוציא מהבדיקה את הרשומה הנוכחית (neq id) ומגביל לחברה
const { data: dup } = await supabase
  .from('workers')
  .select('id')
  .eq('national_id', nationalIdNorm)
  .eq('company_id', companyId)
  .neq('id', id)               // ← מוציא את הרשומה הנוכחית
  .maybeSingle();

if (dup) return NextResponse.json(
  { error: 'עובד עם מזהה זה כבר קיים בחברה' },
  { status: 409 }
);
```

#### הודעות שגיאה

| סיטואציה | הודעה (לפני) | הודעה (אחרי) |
|---|---|---|
| כפילות ב-POST (application check) | `עובד עם מזהה זה כבר קיים במערכת` | `עובד עם מזהה זה כבר קיים בחברה` |
| כפילות ב-PUT (application check) | `עובד עם מזהה זה כבר קיים במערכת` | `עובד עם מזהה זה כבר קיים בחברה` |
| 23505 DB fallback | `עובד עם מזהה זה כבר קיים` | `עובד עם מזהה זה כבר קיים בחברה` |

שינוי זה מונע מחברה ב' להסיק שאדם עם זהות מסוימת קיים **במערכת** (שזה מידע חוצה-חברות).

---

## בידוד אחסון (Storage)

קבצי עובד (תמונות, מסמכים) מוגנים דרך `lib/storage/authorize.ts`:

- **Mode A** (workers, documents): בדיקה ישירה מול `company_id` בטבלה.
- **Mode B** (safety_briefings, height_restrictions וכו'): בדיקה דרך שרשרת `worker_id → workers.company_id`.
- **Mode C** (vehicles, equipment): מצב תאימות לחברה בודדת — נחסם כשיש יותר מחברה אחת פעילה.

חברה ב' לא יכולה לקבל signed URL לקובץ של חברה א' — גם אם ידועה לה הנתיב המדויק.

---

## בידוד חיפוש וייצוא

### חיפוש (`GET /api/workers`)

כל שאילתה מסוננת בחובה לפי `company_id` של המשתמש המחובר:

```typescript
const { companyId } = context;  // מתוך getCurrentCompanyContext() — אסור לבוא מה-browser
supabase.from('workers').select('*').eq('company_id', companyId);
```

### ייצוא (`lib/export/exportTables.ts`)

`workers` ו-`documents` נמצאים ב-`COMPANY_SCOPED_TABLES` — כל שאילתת ייצוא מגבילה ל-`company_id`.

---

## בידוד ביריעות בטיחות (Safety Briefings)

`safety_briefings` עדיין **ללא** `company_id` (Phase 2 Batch 2+). הטבלה גלובלית כרגע.

**סטטוס:** pre-Batch 2 — אין לשנות בסשן זה.

---

## 15 תרחישי הבדיקה האוטומטית

הבדיקות נמצאות ב-`lib/workers/__tests__/identity-isolation.test.ts`.

| # | תרחיש | מצופה |
|---|---|---|
| 1 | חברה א' יוצרת זהות `203530332` | הצלחה |
| 2 | חברה ב' יוצרת זהות `203530332` | הצלחה |
| 3 | חברה א' מנסה ליצור `203530332` שוב | נדחה (409) |
| 4 | הודעת שגיאה לחברה ב' לא כוללת "במערכת" | "בחברה" בלבד |
| 5 | שאילתת GET של חברה ב' לא מחזירה עובדי חברה א' | רק עובדי חברה ב' |
| 6 | עובד א' ועובד ב' עם אותה זהות — UUID שונה | WORKER_A_ID ≠ WORKER_B_ID |
| 7 | מסמכי עובד א' לא נגישים לחברה ב' | 403/denied |
| 8 | מסמכי עובד ב' לא נגישים לחברה א' | 403/denied |
| 9 | חיפוש בחברה א' מחזיר רק עובד א' | 1 תוצאה |
| 10 | חיפוש בחברה ב' מחזיר רק עובד ב' | 1 תוצאה |
| 11 | ייצוא לחברה א' מכיל רק עובדי חברה א' | company_id מסונן |
| 12 | שאילתות service-role מסוננות ב-company_id | הפגנת חובת הסינון |
| 13 | עדכון זהות בחברה א' — התנגשות עם עובד אחר בחברה א' | נדחה |
| 14 | עדכון זהות בחברה א' — אותה זהות בחברה ב' | מותר |
| 15 | הודעת שגיאה לא חושפת קיום בין-חברות | "בחברה" לא "במערכת" |

---

## סדר פעולות לביצוע

1. הרץ `preview_worker_identity_isolation.sql` — ודא 0 כפילויות פנים-חברה.
2. קבל אישור מהמשתמש לביצוע המיגרציה.
3. הרץ `migration_worker_identity_isolation.sql` בעורך SQL של Supabase.
4. ודא שהאינדקסים החדשים נוצרו (`workers_company_national_id_unique`, `workers_company_passport_number_unique`).
5. ודא שהאינדקסים הישנים נמחקו.

---

## מגבלות ידועות (Pre-Batch 2)

- `safety_briefings`, `height_restrictions`, `professional_licenses` — אין company_id.
- `vehicles`, `heavy_equipment`, `lifting_equipment` — אין company_id.
- ייצוא טבלאות גלובליות לא מסונן לפי חברה.

אין לטפל במגבלות אלה בסשן זה.
