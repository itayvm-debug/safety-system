# QA SESSION 05 — ממצאי קבלני משנה
**תאריך:** 2026-08-09
**מפגש:** QA Session 05 — Subcontractors Phase A
**סטטוס:** PHASE A COMPLETE — FINDINGS READY

---

## סיכום ריצת הבדיקות

| מדד | ערך |
|-----|-----|
| סה"כ תרחישים | 76 |
| עברו | 71 |
| דולגו (חסר TEST_SKIP_COMPANY_ID) | 5 |
| נכשלו | 0 |
| משך ריצה | ~14 דקות |

### תרחישים שדולגו (SUB-42 עד SUB-46)
תרחישים אלו בודקים ניצול בטיחות עם מזהי קבלן-משנה מ-Company A (ה-UUID האמיתי של SafeDoc).
הם דולגו כי `TEST_SKIP_COMPANY_ID` לא מוגדר בסביבה זו.
**הבאגים שהם בודקים (SEC-01 עד SEC-04) מאושרים ממקורות אחרים — ראו להלן.**

---

## ממצאים לפי חומרה

---

### 🔴 קריטי (1)

#### CF-01 — קובץ `[id]/route.ts` הוא עותק של ה-Collection Route
**קובץ:** `app/api/subcontractors/[id]/route.ts`
**מזהה:** CF-01 (Carry-Forward מ-QA Session 04)
**תרחישים:** SUB-01 עד SUB-12, SUB-22, SUB-23, SUB-25, SUB-35, SUB-40, SUB-41, SUB-68, SUB-75, SUB-76

**תיאור:**
הקובץ `[id]/route.ts` הוא עותק מלא של `route.ts` (ה-Collection Route) ואינו מממש את המניפולציות על ישות יחידה:

| Method | התנהגות בפועל | התנהגות הצפויה |
|--------|--------------|----------------|
| GET `/{id}` | 200 — מחזיר את כל הרשימה (מתעלם מ-`id`) | 200 — מחזיר ישות בודדת לפי `id` |
| POST `/{id}` | 201 — יוצר קבלן-משנה חדש (מתעלם מ-`id`) | 405 |
| PATCH `/{id}` | 405 | 200 — עדכון שדות / ארכיב |
| DELETE `/{id}` | 405 | 200 — מחיקה / ארכיב |

**השפעה פונקציונלית:**
- **עריכת קבלן-משנה** — כפתור "שמור" שולח PATCH ← 405 ← מוצגת שגיאה inline, שינוי לא נשמר.
- **ארכיב קבלן-משנה** — כפתור "ארכיב" שולח PATCH ← 405 ← `alert('שגיאה')` נקרא, ישות לא מועברת לארכיב.
- **שיוך עובד אחראי** — `ResponsibleWorkerSelector` שולח PATCH ← 405 ← כשל שקט, שינוי לא נשמר.
- **GET /{id} לא מציג 404** — בקשת `GET /api/subcontractors/any-uuid` מחזירה 200 עם כל הרשימה, גם כשה-UUID אינו קיים או שייך לחברה אחרת.

**הפרדת אבטחה:**
- GET `/{id}` — נתונים מוחזרים מסוננים לפי `companyId` (כמו ב-Collection). אין דליפה.
- POST `/{id}` — רשומה נוצרת עם `company_id` של הפעיל. אין דליפה.
- אין סיכון של mutation cross-tenant ישיר מהנתיב הזה.

**פעולה נדרשת:** מימוש מלא של GET/PATCH/DELETE בקובץ `[id]/route.ts`.

---

### 🟠 גבוה (5)

#### B-UI-01 — שימוש ב-`window.confirm()` בטיפול מחיקה/ארכיב
**קובץ:** `components/subcontractors/SubcontractorList.tsx` — `handleDelete`
**תרחישים:** SUB-23, SUB-24

**תיאור:**
פעולת הארכיב משתמשת ב-`window.confirm()` המובנה של הדפדפן במקום דיאלוג inline או modal:
```typescript
if (!confirm(`להעביר את "${name}" לארכיון?`)) return;
```
**השפעה:** לא ניתן לבדוק ב-CI headless. חוויית משתמש לא עקבית עם שאר הממשק (HE, LE, עובדים — כולם משתמשים ב-modal). אין לאפשר ל-`window.confirm` לחסום את ה-event loop.

**הערה:** בעיה זהה קיימת ב-LE (B-03 מ-QA Session 03). דפוס חוזר.

---

#### B-UI-02 — שימוש ב-`window.alert('שגיאה')` בטיפול שגיאת ארכיב
**קובץ:** `components/subcontractors/SubcontractorList.tsx` — `handleDelete`
**תרחישים:** SUB-23

**תיאור:**
כשה-PATCH נכשל (405 עקב CF-01), הקוד קורא:
```typescript
if (!res.ok) { alert('שגיאה'); return; }
```
**השפעה:** הודעת שגיאה גנרית ולא ניתנת לעיצוב. לא ניתן לבדוק ב-CI headless. בעיה זהה ב-LE (B-04).

---

#### SEC-01 — HE POST מקבל `subcontractor_id` ללא בדיקת בעלות
**קובץ:** `app/api/heavy-equipment/route.ts` — POST handler
**תרחישים:** SUB-43 (דולג — דורש Company A ID), SUB-72

**תיאור:**
נתיב `POST /api/heavy-equipment` מאפשר שיוך `subcontractor_id` שאינו שייך לחברה הפעילה:
```typescript
// אין בדיקה: SELECT id FROM subcontractors WHERE id = ? AND company_id = ?
subcontractor_id: subcontractor_id || null,  // מוכנס ישירות
```
**התנהגות לפי סוג ID:**
- UUID שאינו קיים בכלל → 500 (הגנת FK מקרית, לא מכוונת)
- UUID של Company A (קיים ב-DB) → 201, הפניה cross-company נשמרת ✗

**השוואה:** LE POST (B-07 fix, QA Session 03) מבצע בדיקת בעלות נכונה ← 404 לכל UUID שאינו שייך לחברה.

---

#### SEC-02 — HE PATCH מקבל `subcontractor_id` ללא בדיקת בעלות
**קובץ:** `app/api/heavy-equipment/[id]/route.ts` — PATCH handler
**תרחישים:** SUB-44 (דולג — דורש Company A ID)

**תיאור:**
נתיב `PATCH /api/heavy-equipment/{id}` מאפשר עדכון `subcontractor_id` ללא אימות בעלות.
- UUID של Company A (קיים ב-DB) → 200, הפניה cross-company נשמרת ✗

---

#### SEC-03 — Worker PATCH מקבל `subcontractor_id` ללא בדיקת בעלות
**קובץ:** `app/api/workers/[id]/route.ts` — PATCH handler
**תרחישים:** SUB-45 (דולג — דורש Company A ID), SUB-74

**תיאור:**
`subcontractor_id` מופיע ב-`PATCH_ALLOWED` ללא כל בדיקת בעלות:
```typescript
const PATCH_ALLOWED = [
  'subcontractor_id',  // ← אין בדיקה WHO_OWNS sub_id
  ...
] as const;
```
**התנהגות לפי סוג ID:**
- UUID שאינו קיים → 500 (הגנת FK מקרית)
- UUID של Company A → 200, worker מקושר לקבלן-משנה של חברה אחרת ✗

---

#### SEC-04 — LE PATCH מקבל `subcontractor_id` ללא בדיקת בעלות
**קובץ:** `app/api/lifting-equipment/[id]/route.ts` — PATCH handler
**תרחישים:** SUB-46 (דולג — דורש Company A ID), SUB-73

**תיאור:**
תיקון B-07 (QA Session 03) נגע רק ב-POST. ה-PATCH נשאר ללא בדיקה:
```typescript
if (subcontractor_id !== undefined) updates.subcontractor_id = subcontractor_id;
// ← אין SELECT ... WHERE company_id = ?
```
**התנהגות לפי סוג ID:**
- UUID שאינו קיים → 500 (הגנת FK מקרית)
- UUID של Company A → 200, LE מקושרת לקבלן-משנה של חברה אחרת ✗

**הערה:** SEC-01 עד SEC-04 ניצולים רק עם UUID **אמיתי** של חברה אחרת. הגנת ה-FK מונעת שיוך ל-UUID שאינו קיים כלל — אך זו הגנה מקרית, לא מכוונת, ואינה תחליף לבדיקת בעלות.

---

### 🟡 בינוני (1)

#### B-UI-03 — שיוך עובד אחראי נכשל שקטות
**קובץ:** `components/subcontractors/SubcontractorList.tsx` — `ResponsibleWorkerSelector.handleChange`
**תרחישים:** SUB-25

**תיאור:**
```typescript
await fetch(`/api/subcontractors/${sub.id}`, {
  method: 'PATCH',  // ← 405 בגלל CF-01
  body: JSON.stringify({ responsible_worker_id: newId || null }),
});
const chosen = workers.find((w) => w.id === newId) ?? null;
onChanged(chosen);  // ← עדכון אופטימיסטי, לא נבדק אם הבקשה עברה
```
המשתמש רואה את השינוי ב-UI, אך לאחר רענון העמוד — הבחירה נעלמת.
**השפעה:** כשל שקט. ניתן לטעות שהפעולה הצליחה. תלוי ב-CF-01.

---

### 🔵 נמוך (1)

#### B-ERR-01 — FK Violation מחזיר 500 במקום 404
**קבצים:** `app/api/heavy-equipment/route.ts`, `app/api/heavy-equipment/[id]/route.ts`, `app/api/workers/[id]/route.ts`, `app/api/lifting-equipment/[id]/route.ts`
**תרחישים:** SUB-73, SUB-74

**תיאור:**
כאשר `subcontractor_id` הוא UUID שאינו קיים ב-DB, Supabase מחזיר שגיאת FK constraint.
הנתיב לא תופס זאת ומחזיר 500 (שגיאת שרת) במקום 404 (לא נמצא).

**השוואה:** LE POST (B-07) מחזיר 404 — `{ error: 'Subcontractor not found' }`. אותה גישה נדרשת בנתיבים האחרים.

---

## ממצאים חיוביים

| בדיקה | תוצאה |
|-------|--------|
| אבטחת GET — נתונים מסוננים לפי `company_id` | ✅ Company B רואה רק את הנתונים שלה |
| שעריי 401 לבלתי-מאומתים (GET, POST, [id]) | ✅ כל הנתיבים מוחזרים 401 ללא session |
| B-07 — LE POST בדיקת בעלות תקינה | ✅ 404 ל-UUID שאינו שייך לחברה |
| הגדרת `company_id` בעת יצירת רשומה | ✅ SUB-15, SUB-16 — `company_id` מוגדר נכון |
| רשומות ארכיב נעלמות מהרשימה | ✅ SUB-38, SUB-60 |
| מיון אלפביתי | ✅ SUB-61 |
| RTL + עברית | ✅ SUB-56 |
| תצוגה מובייל (390×844) | ✅ SUB-55 — ללא overflow |
| Export auth boundary | ✅ SUB-62 — 401 ללא session |
| Weekly-status report — scoped לחברה | ✅ SUB-63 |
| Join responsible_worker | ✅ SUB-32, SUB-37 |
| שם קבלן-משנה ב-HE/LE join | ✅ SUB-33, SUB-34 |

---

## מפת הבאגים לפי קובץ

```
app/api/subcontractors/
  [id]/route.ts          ← CF-01 (קריטי)

app/api/heavy-equipment/
  route.ts               ← SEC-01 (גבוה)
  [id]/route.ts          ← SEC-02 (גבוה)

app/api/workers/
  [id]/route.ts          ← SEC-03 (גבוה)

app/api/lifting-equipment/
  [id]/route.ts          ← SEC-04 (גבוה)
  route.ts               ✅ B-07 מתוקן

components/subcontractors/
  SubcontractorList.tsx  ← B-UI-01, B-UI-02, B-UI-03
```

---

## סדר עדיפויות לתיקון

| עדיפות | מזהה | פעולה |
|--------|------|--------|
| 1 | CF-01 | מימוש GET/PATCH/DELETE ב-`subcontractors/[id]/route.ts` |
| 2 | SEC-01 עד SEC-04 | הוספת בדיקת בעלות (`WHERE id = ? AND company_id = ?`) לנתיבי HE POST, HE PATCH, Worker PATCH, LE PATCH — לפי תבנית B-07 |
| 3 | B-UI-01, B-UI-02 | החלפת `confirm`/`alert` בדיאלוג/הודעה inline |
| 4 | B-UI-03 | הוספת טיפול שגיאה ב-`ResponsibleWorkerSelector.handleChange` |
| 5 | B-ERR-01 | תפיסת שגיאות FK והחזרת 404 עם הודעה מתאימה |

---

## הגנות QA שעמדו

- אין mutation על Company A (SafeDoc) — אומת ב-`verifySafetyGates` לכל בדיקה
- כל הרשומות שנוצרו מסומנות `qa-sub-<timestamp>-<tag>`
- `afterAll` מנקה כל רשומות QA מ-Company B בלבד
- לא בוצע תיקון של CF-01 או כל בעיה אחרת ב-Phase A

---

*QA Session 05 — Phase A. נכתב ע"י Claude Code.*
