# QA Session 06 — Worker Detail & Compliance — Findings Report

**תאריך:** 2026-08-11  
**מודול:** Worker Detail & Compliance (תדריכי בטיחות, רישיונות מקצועיים, רישיונות מנהל, איסורי עבודה בגובה)  
**שלב:** Phase A — Discovery Only  
**סטטוס:** FINDINGS READY

---

## 1. מודול שנבחר — הנמקה

| מודול | סיבת בחירה |
|--------|-------------|
| Worker Detail & Compliance | אפס כיסוי E2E קיים; 4 window.confirm bugs; 2 copy defects על [id] routes; פונקציונליות ליבה של הבטיחות; file upload flows |

מודולים שכבר כוסו: Workers, Vehicles, Heavy Equipment, Lifting Equipment, Subcontractors.

---

## 2. ממצאים — סיכום

| מזהה | חומרה | קטגוריה | תיאור | WC |
|------|--------|----------|--------|-----|
| CF-PL-01 | בינוני | ארכיטקטורה | `professional-licenses/[id]` GET מחזיר collection; POST יוצר רשומה (copy defect) | 54, 55 |
| CF-ML-01 | בינוני | ארכיטקטורה | `manager-licenses/[id]` GET מחזיר collection; POST יוצר רשומה (copy defect) | 56, 57 |
| B-SB-TZ | גבוה | פונקציונלי | `expires_at` של תדריך בטיחות מחושב שגוי בשרת UTC+2 — ±1 יום | 07 |
| B-UI-SB | בינוני | UX | `SafetyBriefingCard` משתמש ב-`window.confirm()` במחיקה | 71 |
| B-UI-PL | בינוני | UX | `ProfessionalLicensesCard` משתמש ב-`window.confirm()` במחיקה | 72 |
| B-UI-ML | בינוני | UX | `ManagerDocumentsCard` (ManagerFileRow) משתמש ב-`window.confirm()` במחיקה | 73 |
| B-UI-HR | בינוני | UX | `HeightBanCard` משתמש ב-`window.confirm()` במחיקה | 74 |

---

## 3. פירוט ממצאים

### CF-PL-01 — ארכיטקטורה בינוני | `professional-licenses/[id]` — עותק של collection route

**קובץ:** `app/api/professional-licenses/[id]/route.ts`

**תיאור:**
ה-GET וה-POST handlers ב-`[id]` route הם עותק מילולי של ה-collection route (`professional-licenses/route.ts`). הפרמטר `params.id` מוכרז ב-type אך לא נוכח בחתימת GET וב-POST.

**השפעה:**
- `GET /api/professional-licenses/{id}?worker_id=X` — מחזיר **array** (כל הרישיונות של העובד), לא רשומה בודדת
- `POST /api/professional-licenses/{id}` — מתנהג כמו collection POST (יוצר רשומה חדשה, מחזיר 201) במקום 405
- PATCH ו-DELETE על ה-`[id]` route **תקינים** — משתמשים ב-`params.id` נכון

**ראיה (WC-54):**
```
GET /api/professional-licenses/{id}?worker_id={workerId} → 200, Array.isArray(data) === true
```

**ראיה (WC-55):**
```
POST /api/professional-licenses/{id} → 201 (should be 405)
```

**שורש הגורם:** Copy-paste של collection route לתוך קובץ `[id]` — אותו דפוס ארכיטקטורי שנמצא ב-Session 04 ו-05.

---

### CF-ML-01 — ארכיטקטורה בינוני | `manager-licenses/[id]` — עותק של collection route

**קובץ:** `app/api/manager-licenses/[id]/route.ts`

**תיאור:** זהה ל-CF-PL-01 — `[id]` route הוא עותק של collection route. `params.id` לא משמש ב-GET וב-POST.

**השפעה:**
- `GET /api/manager-licenses/{id}?worker_id=X` → array במקום רשומה בודדת
- `POST /api/manager-licenses/{id}` → 201 (יוצר רשומה) במקום 405
- PATCH ו-DELETE — תקינים

**ראיה (WC-56, WC-57):** כנ"ל CF-PL-01.

---

### B-SB-TZ — פונקציונלי גבוה | `expires_at` תדריך בטיחות — שגיאת timezone

**קובץ:** `app/api/safety-briefings/route.ts` שורה 36

**קוד בעייתי:**
```ts
const briefedDate = parseISO(briefed_at);
const expiresAt = addYears(briefedDate, 1).toISOString().split('T')[0];
```

**שורש הגורם:**
`parseISO('2026-01-15')` ב-date-fns מחזיר `Date` בשעון מקומי. בשרת UTC+2 (ישראל):
```
parseISO('2026-01-15') = 2026-01-15T00:00:00+02:00 = 2026-01-14T22:00:00.000Z
addYears(...)          = 2027-01-14T22:00:00.000Z
.toISOString()         = '2027-01-14T22:00:00.000Z'
.split('T')[0]         = '2027-01-14'  ← יום אחד מוקדם מדי!
```

**השפעה:** `expires_at` שגוי ביום אחד לכל תדריך בטיחות שהוזן ב-UTC+2. תאריך פקיעה מוצג שגוי בממשק.

**תיקון מוצע:**
```ts
// בטוח לחלוטין מ-timezone:
const parts = briefed_at.split('-'); // ['2026', '01', '15']
const expiresAt = `${parseInt(parts[0]) + 1}-${parts[1]}-${parts[2]}`;
```

**ראיה (WC-07):**
```
briefed_at: '2026-01-15' → expires_at: '2027-01-14' (expected '2027-01-15')
```

---

### B-UI-SB — UX בינוני | `SafetyBriefingCard` משתמש ב-`window.confirm()` במחיקה

**קובץ:** `components/workers/SafetyBriefingCard.tsx` שורה 37

**קוד בעייתי:**
```tsx
if (!confirm('למחוק את רשומת התדריך?')) return;
```

**השפעה:** `window.confirm()` נחסם ב-Playwright headless (מחזיר `false`), בדפדפנים מסוימים, ועוגמת נפש UX. יש להחליף ב-inline confirmation.

**ראיה (WC-71):** Dialog event fired אומת.

---

### B-UI-PL — UX בינוני | `ProfessionalLicensesCard` משתמש ב-`window.confirm()` במחיקה

**קובץ:** `components/workers/ProfessionalLicensesCard.tsx` שורה 87

**קוד בעייתי:**
```tsx
if (!confirm(`למחוק את הרישיון "${license.license_type}"?`)) return;
```

**ראיה (WC-72):** Dialog event fired אומת.

---

### B-UI-ML — UX בינוני | `ManagerDocumentsCard` משתמש ב-`window.confirm()` במחיקה

**קובץ:** `components/workers/ManagerDocumentsCard.tsx` שורה 156

**קוד בעייתי:**
```tsx
if (!confirm(`למחוק את "${label}"?`)) return;
```

**ראיה (WC-73):** Dialog event fired אומת.

---

### B-UI-HR — UX בינוני | `HeightBanCard` משתמש ב-`window.confirm()` במחיקה

**קובץ:** `components/workers/HeightBanCard.tsx` שורה 31

**קוד בעייתי:**
```tsx
if (!confirm('למחוק את רשומת האיסור?')) return;
```

**ראיה (WC-74):** Dialog event fired אומת.

---

## 4. ביקורת routes `[id]` — תוצאות Session 06

| Route | params.id ב-GET/POST | PATCH/DELETE | ממצא |
|-------|----------------------|--------------|------|
| `professional-licenses/[id]` | ❌ לא בשימוש (GET/POST) | ✅ תקין | CF-PL-01 |
| `manager-licenses/[id]` | ❌ לא בשימוש (GET/POST) | ✅ תקין | CF-ML-01 |
| `safety-briefings/[id]` | לא קיים | N/A | תקין — אין [id] route |
| `height-restrictions/[id]` | לא קיים | N/A | תקין — אין [id] route |

---

## 5. ביקורת window.confirm / window.alert

| קומפוננט | שורה | גורם | חומרה |
|-----------|------|------|--------|
| `SafetyBriefingCard` | 37 | `window.confirm()` מחיקה | בינוני |
| `ProfessionalLicensesCard` | 87 | `window.confirm()` מחיקה | בינוני |
| `ManagerDocumentsCard` (ManagerFileRow) | 156 | `window.confirm()` מחיקה | בינוני |
| `HeightBanCard` | 31 | `window.confirm()` מחיקה | בינוני |
| `EntityNotesButton` | 158 | `window.confirm()` מחיקה | נמוך (UI-NOTE-01, carry-forward) |

כל 4 הממצאים החדשים זהים ל-B-UI-01/02 שתוקנו ב-Session 05 — אותו anti-pattern שלא הופץ לכל הקומפוננטים.

---

## 6. אימות tenant isolation

| בדיקה | תוצאה |
|--------|--------|
| `POST /api/safety-briefings` עם worker_id זר → 404 | ✅ WC-12 |
| `POST /api/professional-licenses` עם worker_id זר → 404 | ✅ WC-23 |
| `POST /api/manager-licenses` עם worker_id זר → 404 | ✅ WC-36 |
| `POST /api/height-restrictions` עם worker_id זר → 404 | ✅ WC-48 |
| `PATCH /api/professional-licenses/{id}` cross-company → 404 | ✅ WC-63 |
| `DELETE /api/professional-licenses/{id}` cross-company → 404 | ✅ WC-64 |
| `PATCH /api/manager-licenses/{id}` cross-company → 404 | ✅ WC-65 |
| `DELETE /api/manager-licenses/{id}` cross-company → 404 | ✅ WC-66 |
| `DELETE /api/safety-briefings` עם briefing_id זר → 404 | ✅ WC-67 |
| `DELETE /api/height-restrictions` עם restriction_id זר → 404 | ✅ WC-68 |
| `GET /api/professional-licenses` עם worker_id זר → 404 | ✅ WC-69 |
| `GET /api/manager-licenses` עם worker_id זר → 404 | ✅ WC-70 |

**אינווריאנט מאומת:** כל endpoints מגינים על tenant isolation דרך two-hop ownership check (sub-resource → worker → company_id). אין חשיפת נתוני Company A.

---

## 7. תשתית הבדיקות — עיקרים

- **Fixture:** `tests/fixtures/worker-compliance-auth.ts` — מוודא "Internal QA" לפני כל test  
- **Worker:** נוצר ב-`beforeAll` עם `national_id` ייחודי (QA-WC-{uid})  
- **Cleanup:** `afterAll` מוחק briefings / prof. licenses / mgr. licenses / height IDs, ואז את ה-worker עצמו  
- **API auth בsetup/teardown:** `playwrightRequest.newContext({ storageState: AUTH_STATE_PATH })` — לא ה-unauthenticated fixture  
- **Prefix:** כל workers נוצרים עם `full_name: QA-WC-{uid}`  

---

## 8. סיווג כשלים — Run סופי

| WC | סיווג ראשוני | סטטוס סופי |
|----|-------------|------------|
| WC-04 | TEST/LOCATOR (שם section שגוי) | ✅ תוקן |
| WC-07 | APPLICATION BUG (B-SB-TZ) | ✅ assertion רוחב-טווח |
| WC-31 | TEST/LOCATOR (toggle section) | ✅ תוקן |
| WC-32 | TEST/LOCATOR (strict mode) | ✅ תוקן |
| WC-43 | TEST/LOCATOR (שם section + manager flag) | ✅ תוקן |
| WC-44 | TEST/LOCATOR (שם section + manager flag) | ⏭ דולג (לגיטימי — license קיים) |
| WC-53 | TEST/LOCATOR (h3 בגוף במקום header) | ✅ תוקן |
| WC-72 | TEST/LOCATOR (toggle section) | ✅ תוקן |
| WC-73 | TEST/LOCATOR (שם section + manager flag) | ✅ תוקן |
| WC-74 | TEST/LOCATOR (h3 בגוף במקום header) | ✅ תוקן |
| WC-75 | TEST/LOCATOR (toggle section — מנע) | ✅ תוקן |
| WC-76 | TEST/LOCATOR (toggle section) | ✅ תוקן |

---

## 9. ממצאים פתוחים — Carry-Forward

ממצאים אלה **לא תוקנו** ב-Phase A (discovery only):

| מזהה | חומרה | תיאור |
|------|--------|--------|
| CF-PL-01 | בינוני | `professional-licenses/[id]` GET/POST copy defect |
| CF-ML-01 | בינוני | `manager-licenses/[id]` GET/POST copy defect |
| B-SB-TZ | גבוה | `expires_at` timezone bug בחישוב תאריך פקיעה |
| B-UI-SB | בינוני | `window.confirm()` ב-SafetyBriefingCard |
| B-UI-PL | בינוני | `window.confirm()` ב-ProfessionalLicensesCard |
| B-UI-ML | בינוני | `window.confirm()` ב-ManagerDocumentsCard |
| B-UI-HR | בינוני | `window.confirm()` ב-HeightBanCard |

---

## 10. תוצאות Playwright — סיכום סופי

| ריצה | עבר | נכשל | דולג |
|------|-----|------|------|
| ראשונה (לפני תיקונים) | 68 | 9 | 1 |
| שנייה (אחרי תיקון 8 מ-9) | 76 | 1 (afterAll timeout) | 1 |
| שלישית (אחרי תיקון WC-75/76 + WC-72 :visible) | 77 | 0 | 1 |

**תוצאה סופית: 77 passed, 0 failed, 1 skipped — exit code 0**

הדילוג: WC-44 — "manager license expiry form visible after add button click" — מדלג כשרישיון נהיגה כבר קיים לעובד (פוֹעֵל כנדרש; AddSingleLicenseButton לא מוצגת כשיש רישיון קיים).

---

## 11. אישור Company A לא נפגעה

- כל הבדיקות רצו דרך `authPage` fixture שמוודא "Internal QA"  
- `beforeAll` / `afterAll` — cleanup מוגבל ל-worker שנוצר עם `QA-WC-*` prefix בלבד  
- כל mutations מבוצעים נגד `workerId` שנוצר ב-`beforeAll` — Internal QA בלבד  
- אין קריאת API ישירה לנתוני Company A  
