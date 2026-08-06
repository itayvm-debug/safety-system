# הגדרת טנאנט QA ייעודי — SafeDoc

## מטרה

מדריך זה מתאר כיצד ליצור חברת QA ייעודית ב-Supabase לצורך בדיקות בלבד, כך שבדיקות אוטומטיות לעולם לא יגעו בנתוני Company A הפרודקשן.

---

## ארכיטקטורת הבידוד

```
Company A (פרודקשן)          Company QA (בדיקות)
─────────────────────         ────────────────────────
נתוני לקוחות אמיתיים          נתוני דמה בלבד
TEST_SKIP_COMPANY_ID=<id>     COMPANY_B=<id> בטסטים
לעולם לא נגענו                ניתן למחיקה ויצירה מחדש
```

---

## שלב 1 — הגדרת משתני סביבה

ב-.env.local (מחוץ ל-git):

```bash
# מזהה Company A — שמור על ידי בדיקות safety guard
TEST_SKIP_COMPANY_ID=<UUID של Company A מהפרודקשן>

# כתובת ה-Supabase לסביבת הפיתוח
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

> **חשוב:** `TEST_SKIP_COMPANY_ID` צריך להכיל את ה-UUID של החברה הפרודקשן האמיתית. אם הבדיקות ינסו לגעת בחברה זו — הן יבלמו מיד עם הודעת שגיאה.

---

## שלב 2 — יצירת חברת QA ב-Supabase

יש לבצע את הצעדים הבאים **פעם אחת** דרך ממשק ה-Supabase Studio (Table Editor), **ללא SQL ידני**:

### 2.1 צור חברת QA

בטבלת `companies`:

| שדה | ערך |
|-----|-----|
| name | `SafeDoc QA` |
| is_active | `true` |
| settings | `{}` |

רשום את ה-`id` שנוצר — זה יהיה `COMPANY_QA_ID`.

### 2.2 צור משתמש QA — מנהל חברה

בממשק Auth > Users:

| שדה | ערך |
|-----|-----|
| Email | `qa-admin@safedoc.local` |
| Password | סיסמה בטוחה (רשום בסייף) |
| Email confirmed | כן |

לאחר היצירה, קבל את ה-`user_id`.

### 2.3 צור פרופיל ל-qa-admin

בטבלת `profiles`:

| שדה | ערך |
|-----|-----|
| id | `<user_id>` |
| full_name | `QA Admin` |
| username | `qa-admin` |
| email | `qa-admin@safedoc.local` |
| role | `user` |
| is_active | `true` |

### 2.4 שייך qa-admin לחברת QA

בטבלת `company_members`:

| שדה | ערך |
|-----|-----|
| company_id | `<COMPANY_QA_ID>` |
| user_id | `<user_id>` |
| role | `owner` |
| is_active | `true` |

### 2.5 צור משתמש QA — חבר רגיל (לבדיקות הרשאה)

חזור על 2.2–2.4 עבור:

| שדה | ערך |
|-----|-----|
| Email | `qa-member@safedoc.local` |
| username | `qa-member` |
| role בפרופיל | `user` |
| role בחברה | `member` |

---

## שלב 3 — עדכון קבועי הבדיקות

בקבצי הבדיקות שמשתמשים ב-Company B, ניתן להחליף את ה-UUID הסטטי ב-UUID של חברת QA האמיתית:

```typescript
// app/api/companies/__tests__/cross-company.isolation.test.ts
const COMPANY_B = '<COMPANY_QA_ID>';  // UUID מה-Supabase Studio
```

> **לחלופין:** אפשר להשאיר את ה-UUIDs הסטטיים (`bbbbbbbb-...`) כיוון שהבדיקות מדמות את ה-DB במלואו ואינן נוגעות ב-DB האמיתי.

---

## שלב 4 — אימות הגדרת QA

הפעל את הפקודות הבאות לאימות:

```bash
# וודא שהבדיקות עוברות
npm run test -- --run app/api/companies/__tests__/cross-company.isolation.test.ts

# וודא ש-TEST_SKIP_COMPANY_ID מוגדר
node -e "console.log(process.env.TEST_SKIP_COMPANY_ID || 'NOT SET')"
```

---

## כללי בטיחות

1. **לעולם אל תגע ב-Company A** — כל שינוי בנתוני חברה פרודקשן חייב לעבור דרך ממשק המשתמש בלבד, לא דרך טסטים.
2. **אל תכלול נתוני QA בגיבוי פרודקשן** — חברת QA היא חד-פעמית וניתן למחוק ולצור אותה מחדש בכל עת.
3. **TEST_SKIP_COMPANY_ID חייב להיות מוגדר בכל סביבת CI** שמריצה בדיקות מול Supabase אמיתי.
4. **הסיסמאות של משתמשי QA** יישמרו בסייף הצוות, לא ב-code.

---

## מבנה הטנאנט המוכלל

לאחר ההגדרה, טנאנט QA אמור להראות כך:

```
Company: SafeDoc QA
├── qa-admin@safedoc.local  (role: owner)   ← למנהל חברה בבדיקות
└── qa-member@safedoc.local (role: member)  ← לבדיקות הרשאה
```

---

*נוצר עבור Phase 3 — Company-Scoped User Management*
