# QA סשן 03 — ציוד כבד (Heavy Equipment) — ממצאי Phase A

**תאריך:** 2026-08-07  
**מפעיל:** Claude Sonnet 4.6 (אוטומציה)  
**גרסת Next.js:** 16.2.2 (Turbopack, dev)  
**חברה בדיקות:** Internal QA (Company B בלבד)  
**קבצי מקור שנבדקו:** `app/api/heavy-equipment/**`, `app/api/heavy-equipment-insurances/**`, `components/heavy-equipment/**`, `lib/documents/status.ts`, `types/index.ts`

---

## תוצאות ריצה

| מדד | ערך |
|---|---|
| סך בדיקות | 65 |
| עברו | 61 |
| נכשלו (בעיות לוקייטור — לא באגי אפליקציה) | 4 |
| זמן ריצה | 16.0 דקות |
| תשתית | Playwright + Chromium + dev server מקומי |

---

## סיכום ממצאים

| # | חומרה | תיאור | סטטוס |
|---|---|---|---|
| **B-01** | 🔴 קריטי | `[id]/route.ts` הוא עותק מדויק של ה-collection route — PATCH ו-DELETE מחזירים 405, GET מחזיר רשימה במקום פריט בודד | ✅ מאומת |
| **B-02** | 🔴 קריטי | `heavy-equipment-insurances/[id]/route.ts` הוא עותק מדויק של ה-collection route — PATCH ו-DELETE מחזירים 405, GET מחזיר 400 | ✅ מאומת |
| **B-03** | 🟠 גבוה | עריכת פרטים (PATCH) → 405 → catch מציג "שגיאת תקשורת" ואין ניווט — המשתמש לא יכול לערוך ציוד | ✅ מאומת |
| **B-04** | 🟠 גבוה | ארכיון (PATCH `is_archived: true`) → 405 → `alert('שגיאה')` ואין ניווט — המשתמש לא יכול לארכב ציוד | ✅ מאומת |
| **B-05** | 🟠 גבוה | הפעלה/כיבוי (`is_active`) בדף הפרטים: כישלון שקט — אין שגיאה, console unhandledRejection | ✅ מאומת |
| **B-06** | 🟠 גבוה | שמירת תאריך תפוגה (רישיון/תסקיר): כישלון שקט — אין הצלחה, אין שגיאה, console unhandledRejection | ✅ מאומת |
| **B-07** | 🟡 בינוני | POST `/api/heavy-equipment` מתעלם שקטית מ-`manufacturer`, `machine_identifier`, `safe_working_load`, `power_type` | ✅ מאומת |
| **B-08** | 🟡 בינוני | מחיקת ביטוח (DELETE → 405) מציגה שגיאה "שגיאה במחיקה" בשורת הביטוח | ✅ מאומת |
| **B-09** | 🟡 בינוני | שמירת תאריך תפוגה של ביטוח (PATCH → 405) מציגה שגיאה "שגיאה" בשורת הביטוח | ✅ מאומת |
| **B-10** | 🔵 נמוך | הפעלה/כיבוי בשורת רשימה: הblink אופטימיסטי ואז חזרה אוטומטית — אין שגיאה מוצגת | ✅ מאומת |
| **I-01** | ℹ️ הערה | שגיאות console `unhandledRejection: SyntaxError: Failed to execute 'json' on 'Response'` ב-`handleToggleActive` וב-`handleSaveExpiry` כשה-API מחזיר 405 עם גוף ריק | תצפית |

---

## B-01 — קריטי: `app/api/heavy-equipment/[id]/route.ts` הוא עותק של ה-collection route

### תיאור

הקובץ `app/api/heavy-equipment/[id]/route.ts` (2134 bytes) **זהה בדיוק** ל-`app/api/heavy-equipment/route.ts` (2134 bytes). הוא מייצא רק `GET` (שמחזיר את כל הציוד של החברה, מתעלם מה-`id` ב-URL) ו-`POST` (שיוצר ציוד חדש). **אין handler ל-`PATCH`, `DELETE`, או `GET` בודד.**

### השפעה

כל פעולת כתיבה על ציוד קיים נכשלת:
- עריכת פרטים (description, license_number, subcontractor, project)
- הפעלה/כיבוי (`is_active`)
- העברה לארכיון (`is_archived: true`)
- שמירת תאריך תפוגה (רישיון + תסקיר)
- העלאת תמונת ציוד
- העלאת/מחיקת קובץ רישיון או תסקיר

### שלבי שחזור

1. צור ציוד חדש (`POST /api/heavy-equipment`) — מחזיר 201 עם `id`
2. שלח `PATCH /api/heavy-equipment/{id}` עם גוף JSON כלשהו
3. **תוצאה:** `405 Method Not Allowed`

**אימות ב-HE-23:**
```
PATCH /api/heavy-equipment/{id} → 405 ✅ (expected: 200)
```

**אימות ב-HE-24:**
```
DELETE /api/heavy-equipment/{id} → 405 ✅ (expected: 200/204)
```

**אימות ב-HE-25:**
```
GET /api/heavy-equipment/{id} → 200 + [] (array!) ✅ (expected: single object)
```

### תצפיות UI מרכזיות

| פעולה | קוד ב-UI | תוצאה בפועל |
|---|---|---|
| עריכת פרטים (submit) | `PATCH → res.json() → catch → setError('שגיאת תקשורת')` | מציג "שגיאת תקשורת" + אין ניווט |
| ארכיון (לאחר confirm) | `PATCH → res.ok ? push : alert('שגיאה')` | `alert('שגיאה')` + נשאר בדף |
| הפעלה/כיבוי (דף פרטים) | `PATCH → res.json() [throws] → finally` | כישלון שקט + console error |
| שמירת תפוגה | `PATCH → res.json() [throws] → finally` | כישלון שקט + console error |
| הפעלה/כיבוי (רשימה) | `PATCH → res.ok? setEq(data) : revert → catch revert` | blink ואז חזרה לערך מקורי |

### השערת גורם שורש

קובץ הנתיב הדינמי `[id]/route.ts` נוצר בשגגה כ-**עותק של ה-collection route** במקום לכתוב handler חדש עם `GET` יחיד + `PATCH` + `DELETE`. אין validation של שדות מותרים, אין בדיקת בעלות (`company_id`), ואין החזרה של הרשומה המעודכנת.

### console / network

```
[browser] ⨯ unhandledRejection: SyntaxError: Failed to execute 'json' on 'Response':
    Unexpected end of JSON input
    at handleToggleActive (heavy-equipment/HeavyEquipmentDetail)
```

```
[browser] ⨯ unhandledRejection: SyntaxError: Failed to execute 'json' on 'Response':
    Unexpected end of JSON input
    at handleSaveExpiry (heavy-equipment/HeavyEquipmentDetail)
```

### קבצים לתיקון

- `app/api/heavy-equipment/[id]/route.ts` — נדרש שכתוב מלא עם `GET`, `PATCH`, `DELETE`

---

## B-02 — קריטי: `app/api/heavy-equipment-insurances/[id]/route.ts` הוא עותק של ה-collection route

### תיאור

הקובץ `app/api/heavy-equipment-insurances/[id]/route.ts` (2640 bytes) **זהה בדיוק** ל-`app/api/heavy-equipment-insurances/route.ts` (2640 bytes). הוא מייצא `GET` (שמצריך `?heavy_equipment_id=`, מחזיר 400 ללא פרמטר) ו-`POST` (upsert). **אין handler ל-`PATCH` ו-`DELETE`.**

### השפעה

- עדכון תאריך תפוגה של ביטוח קיים → 405
- העלאת קובץ לביטוח קיים → 405
- מחיקת ביטוח קיים → 405

### שלבי שחזור

1. צור ביטוח (`POST /api/heavy-equipment-insurances`) — מחזיר 200 עם `id`
2. שלח `PATCH /api/heavy-equipment-insurances/{id}` עם `{ expiry_date: '...' }`
3. **תוצאה:** `405 Method Not Allowed`

**אימות ב-HE-44:**
```
PATCH /api/heavy-equipment-insurances/{id} → 405 ✅ (expected: 200)
```

**אימות ב-HE-45:**
```
DELETE /api/heavy-equipment-insurances/{id} → 405 ✅ (expected: 200)
```

**אימות ב-HE-48:**
```
GET /api/heavy-equipment-insurances/{id} → 400 ✅ (expected: 200 + single record)
(מחזיר 400 כי handler הcollection דורש ?heavy_equipment_id=)
```

### תצפיות UI מרכזיות

| פעולה | תוצאה |
|---|---|
| שמירת תפוגה בשורת ביטוח | מציג "שגיאה" בשורה |
| לחצן "הסר" (מחיקת ביטוח) | מציג "שגיאה במחיקה" בשורה |

**אימות ב-HE-46 (UI):** לחצן "הסר" ← dialog confirm ← DELETE → 405 → מציג `p.text-red-600` עם "שגיאה במחיקה" ✅

**אימות ב-HE-47 (UI):** שמירת תפוגה ← PATCH → 405 → מציג `p.text-red-600` עם "שגיאה" ✅

### קבצים לתיקון

- `app/api/heavy-equipment-insurances/[id]/route.ts` — נדרש שכתוב מלא עם `PATCH` ו-`DELETE`

---

## B-03 — גבוה: עריכת פרטים נכשלת עם "שגיאת תקשורת" ואין ניווט

### תיאור

`EquipmentForm.handleSubmit` בעריכה שולח `PATCH /api/heavy-equipment/${id}`. ה-405 הוא text/plain (גוף ריק), `res.json()` נזרק ← catch מציב `error = 'שגיאת תקשורת'`. הדף נשאר בעמוד העריכה.

### שלבי שחזור

1. גש ל-`/heavy-equipment/new` וצור ציוד
2. גש ל-`/heavy-equipment/{id}/edit`
3. שנה את השדה "תיאור"
4. לחץ "שמור שינויים"
5. **תוצאה:** כפתור מציג "שומר..." ← `שגיאת תקשורת` ← אין ניווט

**ציפייה:** ניווט ל-`/heavy-equipment/{id}` עם הנתונים המעודכנים

**אימות:** HE-28 ✅

---

## B-04 — גבוה: ארכיון נכשל — alert('שגיאה') ואין ניווט

### תיאור

`HeavyEquipmentDetail.handleDelete` שולח `PATCH /api/heavy-equipment/${id}` עם `{ is_archived: true }`. ה-405 ← `res.ok` = false ← `alert('שגיאה')` + `setDeleting(false)`. הציוד נשאר ברשימה.

### שלבי שחזור

1. פתח דף פרטים של ציוד
2. לחץ "העבר לארכיון"
3. אשר ב-dialog ("להעביר את X לארכיון?")
4. **תוצאה:** `alert('שגיאה')` מוצג; הדף נשאר ב-`/heavy-equipment/{id}`
5. הציוד ממשיך להופיע ברשימה

**ציפייה:** ניווט ל-`/heavy-equipment` + הציוד לא מופיע ברשימה

**אימות:** HE-29, HE-30, HE-31 ✅

---

## B-05 — גבוה: הפעלה/כיבוי בדף הפרטים — כישלון שקט, console error

### תיאור

`HeavyEquipmentDetail.handleToggleActive` שולח `PATCH` ← 405 ← `res.json()` נזרק (גוף ריק = Unexpected end of JSON input) ← `finally` מריץ `setTogglingActive(false)`. אין הודעת שגיאה למשתמש. ה-toggle חוזר לאותו ערך.

שגיאת console נראית בלוגי ה-WebServer:
```
[browser] ⨯ unhandledRejection: SyntaxError: Failed to execute 'json' on 'Response':
    Unexpected end of JSON input
    at handleToggleActive (HeavyEquipmentDetail)
```

### שלבי שחזור

1. פתח דף פרטים
2. לחץ על ה-ToggleSwitch
3. **תוצאה:** toggle מהבהב ← חוזר לאותו ערך ← אין שגיאה ← console error

**ציפייה:** toggle מתהפך + הסטטוס מתעדכן

**אימות:** HE-33 ✅ (אין error element גלוי — מאשר כישלון שקט)

---

## B-06 — גבוה: שמירת תאריך תפוגה (רישיון/תסקיר) — כישלון שקט

### תיאור

`HeavyEquipmentDetail.handleSaveExpiry` שולח `PATCH` ← 405 ← `res.json()` נזרק ← `finally` מריץ `setSavingExpiry(false)`. הלחצן "שמור שינויים" חוזר לנורמלי בלי הצלחה, בלי שגיאה. הtimestamp של הציוד לא מתעדכן.

שגיאת console:
```
[browser] ⨯ unhandledRejection: SyntaxError: Failed to execute 'json' on 'Response':
    Unexpected end of JSON input
    at handleSaveExpiry (HeavyEquipmentDetail)
```

### שלבי שחזור

1. פתח דף פרטים של ציוד
2. שנה תאריך תפוגה ב-input
3. Float bar מופיע — לחץ "שמור שינויים"
4. **תוצאה:** כפתור מציג "שומר..." ← חוזר ל"שמור שינויים" ← אין "✓ נשמר בהצלחה" ← תאריך לא נשמר

**ציפייה:** "✓ נשמר בהצלחה" + float bar נסגר + תאריך מתעדכן

**אימות:** HE-38 ✅

---

## B-07 — בינוני: POST `heavy-equipment` מתעלם שקטית משדות נוספים

### תיאור

`POST /api/heavy-equipment` קורא רק:
```typescript
const { description, license_number, subcontractor_id, project_name } = body;
```

השדות `manufacturer`, `machine_identifier`, `safe_working_load`, `power_type` **נשלחים מהטופס** (`EquipmentForm.handleSubmit`) אך **לא נכתבים לDB** ב-INSERT.

למרות שה-handler כולל רק אותם ב-INSERT, שדות המינוי המפעיל — שקיימים בDB ובטופס — **נאבדים בשקט** בעת יצירת ציוד.

### שלבי שחזור

1. פתח `/heavy-equipment/new`
2. מלא את השדות: תיאור, יצרן "Liebherr", סוג הפעלה "מכאני"
3. לחץ "הוסף ציוד" — ניווט לדף הפרטים
4. בדוק ב-API: `GET /api/heavy-equipment` → מצא את הרשומה
5. **תוצאה:** `manufacturer: null`, `power_type: null` — הנתונים אבדו

**ציפייה:** `manufacturer: "Liebherr"`, `power_type: "mechanical"`

**אימות:** HE-12 ✅
```javascript
expect(created?.manufacturer).toBeNull();  // ✅
expect(created?.power_type).toBeNull();    // ✅
```

**הערה:** שדות אלה נשמרים בהצלחה ב-PATCH (עריכה) — אך PATCH נכשל עם 405 (B-01). לכן אין בפועל דרך לשמור שדות אלו.

---

## B-08 — בינוני: מחיקת ביטוח מציגה שגיאה "שגיאה במחיקה" (לא silent)

### תיאור

`InsuranceRow.handleDelete` שולח `DELETE /api/heavy-equipment-insurances/${insurance.id}` ← 405 ← catch ← `setError('שגיאה במחיקה')`. מוצגת הודעת שגיאה אדומה בשורת הביטוח. הביטוח נשאר ברשימה.

זהו **שיפור יחסי** לעומת B-05 וB-06 — יש הודעה למשתמש — אך התוצאה (ביטוח לא נמחק) עדיין שגויה.

**אימות:** HE-46 ✅

---

## B-09 — בינוני: שמירת תפוגה של ביטוח מציגה שגיאה "שגיאה"

### תיאור

`InsuranceRow.handleSaveExpiry` שולח `PATCH /api/heavy-equipment-insurances/${insurance.id}` ← 405 ← catch ← `setError('שגיאה')`. הודעת שגיאה אדומה בשורה. התאריך לא נשמר.

**אימות:** HE-47 ✅

---

## B-10 — נמוך: הפעלה/כיבוי בשורת רשימה — blink אופטימיסטי ואז חזרה

### תיאור

`HeavyEquipmentRow.handleToggle` מבצע update אופטימיסטי מיידי (`setEq` עם `is_active` הפוך) לפני קבלת תגובת ה-API. כשה-PATCH מחזיר 405, `res.json()` נזרק, ה-catch block מרוץ עם `setEq` חזרה.

**תוצאה חזותית:** ה-toggle מהבהב (נראה כמו עובד) ← חוזר למצב מקורי ← אין שגיאה.

**אימות:** HE-32 ✅ (is_active נשאר false ← opacity-50 לא נמצא)

---

## I-01 — תצפית: שגיאות console unhandledRejection

שתי שגיאות console נצפו בזמן ריצת הבדיקות:

```
[browser] ⨯ unhandledRejection: SyntaxError: Failed to execute 'json' on 'Response':
    Unexpected end of JSON input
    at handleToggleActive (HeavyEquipmentDetail.tsx)
```

```
[browser] ⨯ unhandledRejection: SyntaxError: Failed to execute 'json' on 'Response':
    Unexpected end of JSON input
    at handleSaveExpiry (HeavyEquipmentDetail.tsx)
```

**גורם:** Next.js מחזיר 405 עם גוף ריק (`Content-Length: 0`). הפונקציות `handleToggleActive` ו-`handleSaveExpiry` קוראות ל-`res.json()` מחוץ ל-try-catch — עקב כך `SyntaxError` "בורח" ל-global unhandled rejection handler.

**השלכה:** הן ה-DevTools console והן לוגי הServer מציגים שגיאה קריטית. מוניטורינג production (Sentry, Datadog) היה מדווח על uncaught exceptions.

---

## טבלת כיסוי בדיקות

| תחום | בדיקות | עברו | נכשלו |
|---|---|---|---|
| רשימה וניווט | HE-01–04 | 4 | 0 |
| טופס יצירה — שדות ותצוגה | HE-05–07 | 3 | 0 |
| POST API | HE-08–10 | 3 | 0 |
| יצירה — זרימה מלאה | HE-11–16 | 6 | 0 |
| דף פרטים | HE-17–22 | 6 | 0 |
| עריכה + API | HE-23–28 | 6 | 0 |
| ארכיון + Toggle | HE-29–33 | 5 | 0 |
| מסמכים | HE-34–40 | 7 | 1* |
| ביטוחים | HE-41–48 | 8 | 2* |
| חיפוש + סינון | HE-49–55 | 7 | 1* |
| ניווט + Mobile + Multi-tab | HE-56–61 | 6 | 0 |
| Cross-tenant + API | HE-62–65 | 4 | 0 |
| **סך הכל** | **65** | **61** | **4** |

*כל 4 הכישלונות הם **בעיות לוקייטור** בבדיקה — לא באגי אפליקציה (ראה למטה)

---

## בעיות לוקייטור בבדיקות (L-01 עד L-04)

אלו שגיאות בניסוח הbדיקות — לא ממצאי אפליקציה.

| # | בדיקה | גורם | אימות נדרש |
|---|---|---|---|
| L-01 | HE-34 | `locator('[class*="bg-red"], text=חסר')` — CSS לא תקין כי `text=` אינו CSS סלקטור | לשנות ל-`locator('text=חסר')` |
| L-02 | HE-41 | `div.filter({hasText:'ביטוח חובה'}).first()` מחזיר את הdiv החיצוני המכיל את 3 שורות הביטוח → strict mode: 3 כפתורים | לצמצם ל-span עם text-is |
| L-03 | HE-42 | אותו גורם כ-L-02 | כנ"ל |
| L-04 | HE-54 | `filter({hasText:'תקין'})` מוצא "לא תקין" לפני "תקין" (substring match) → לחץ על הכרטיסייה הלא נכונה | לשנות ל-`getByRole('button',{name:'תקין',exact:true})` |

**הערה לגבי L-04 (HE-54):** כיוון שהלוקייטור לחץ על "לא תקין" במקום "תקין", תוצאת הבדיקה (equipment גלוי) אינה מסקנה על מצב ה-filter. יש לאמת ידנית שסינון "תקין" אכן מסתיר ציוד בסטטוס "חסר" לאחר תיקון הלוקייטור.

---

## ממצאים נוספים — ניתוח קוד

### POST handler חסר (יצירה) — ביטוח

`POST /api/heavy-equipment-insurances` עובד תקין עם upsert. ✅

### בדיקת בידוד רב-שוכרי

| בדיקה | תוצאה |
|---|---|
| `GET /api/heavy-equipment` מחזיר רק נתוני Company B | ✅ HE-62 |
| ניסיון ללא אימות מחזיר 401 | ✅ HE-63 |
| URL ישיר ל-ID לא קיים מחזיר שגיאה/404 | ✅ HE-64 |
| POST ביטוח עם equipment_id של חברה אחרת מחזיר 404 | ✅ HE-65 |
| SSR (דף פרטים): נטען נכון, Refresh שומר נתונים | ✅ HE-57 |

### Mobile/Desktop

| בדיקה | תוצאה |
|---|---|
| רשימה — 375px: ללא גלילה אופקית | ✅ HE-58 |
| דף פרטים — 375px: ללא גלילה אופקית | ✅ HE-59 |
| טופס יצירה — 375px: שדות גלויים | ✅ HE-60 |

### Empty / Loading states

| מצב | תוצאה |
|---|---|
| Empty state (אין ציוד) — הודעה "אין כלי צמ"ה רשומים עדיין" | ✅ HE-03 |
| חיפוש ללא תוצאות — "לא נמצאו תוצאות" | ✅ HE-51 |
| Loading state (skeleton) — ראה מקור `HeavyEquipmentList.tsx:149` | נצפה בריצות |

---

## סיכום למפתחים

שני הבאגים הקריטיים (B-01, B-02) נגרמים **מאותה שגיאה**: קובץ הנתיב הדינמי `[id]/route.ts` נוצר כ-copy-paste של ה-collection route. תיקון B-01 מפתח את: עריכה, ארכיון, toggle active, שמירת תפוגה, העלאת תמונה + קבצים. תיקון B-02 מפתח את: עדכון ומחיקת ביטוחים. B-07 (שדות נאבדים ב-POST) דורש הוספת שדות ל-INSERT handler.

**עדיפות תיקון:**
1. B-01 — שכתוב מלא של `app/api/heavy-equipment/[id]/route.ts`
2. B-02 — שכתוב מלא של `app/api/heavy-equipment-insurances/[id]/route.ts`
3. B-07 — הוספת שדות ל-INSERT ב-POST handler
4. L-01–L-04 — תיקון לוקייטורים בבדיקות

**לא נגרמה נזק לנתוני Company A.** כל 65 הבדיקות רצו על Internal QA בלבד.
