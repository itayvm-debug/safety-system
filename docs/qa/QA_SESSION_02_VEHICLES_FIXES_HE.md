# QA SESSION 02 — מודול רכבים — תיקונים
**תאריך:** 2026-08-07  
**סשן:** 02 | מודול: Vehicles  
**שלב:** B — תיקון באגים קריטיים וגבוהים

---

## סיכום תיקונים

| מזהה | חומרה | תוקן? | פירוט |
|------|-------|--------|-------|
| B-01 | קריטי | ✅ | נכתב מחדש `app/api/vehicles/[id]/route.ts` עם GET/PATCH/DELETE |
| B-02 | גבוה | ✅ | נוסף טיפול שגיאה + הצגת הודעה ב-`handleDelete` |
| B-03 | בינוני | ⏭️ | לא תוקן בשלב זה (Medium — מחוץ לטווח Phase B) |

---

## B-01 — קריטי: כתיבה מחדש של `app/api/vehicles/[id]/route.ts`

**בעיה:** הקובץ היה העתק מילה-במילה של הנתיב הקבוצתי — ללא PATCH, DELETE, או GET-יחיד.

**קובץ שתוקן:** `app/api/vehicles/[id]/route.ts`

### שינויים:

**לפני (היה):**
- `GET()` — מחזיר רשימת כל הרכבים (מתעלם מ-`id` בנתיב)
- `POST()` — יוצר רכב חדש (לא שייך לנתיב `[id]`)
- חסרים: PATCH, DELETE

**אחרי (עכשיו):**

#### `GET(_request, { params })`
- מקבל `id` מה-params
- מוודא שהרכב שייך לחברה הנוכחית (`company_id`)
- מחזיר אובייקט רכב יחיד עם join לרישיונות, ביטוחים, ומנהל משויך
- מחזיר 404 אם לא נמצא

#### `PATCH(request, { params })`
- מוודא הרשאת `requireCompanyAdminRole`
- מוודא שהרכב שייך לחברה לפני עדכון (מניעת cross-company tampering)
- שדות שניתן לעדכן: `vehicle_type`, `model`, `vehicle_number`, `vehicle_color`, `image_url`, `assigned_manager_id`, `project_name`, `notes`, `is_archived`, `is_active`
- מוודא שמנהל חדש (אם הוזן) שייך לאותה חברה — מחזיר 422 אם לא
- מחזיר 200 + אובייקט מעודכן עם joins מלאים

#### `DELETE(_request, { params })`
- מוודא הרשאת `requireCompanyAdminRole`
- מוודא בעלות לפני מחיקה
- מוחק רכב (cascade מוחק רישיונות וביטוחים)
- מחזיר 200 `{ success: true }`

**שינוי בבדיקות:**  
V28, V29, V33, V34 עודכנו לבדוק את ההתנהגות התקינה (במקום לאמת נוכחות הבאג).

---

## B-02 — גבוה: הצגת שגיאה בכשל ארכיון

**בעיה:** `VehicleDetail.handleDelete` לא הציג הודעת שגיאה כשה-PATCH נכשל.

**קובץ שתוקן:** `components/vehicles/VehicleDetail.tsx`

### שינויים:

**נוסף state:**
```typescript
const [archiveError, setArchiveError] = useState('');
```

**הפונקציה `handleDelete` — לפני:**
```typescript
if (res.ok) { router.push('/vehicles'); router.refresh(); }
// else: לא קורה דבר
```

**הפונקציה `handleDelete` — אחרי:**
```typescript
if (res.ok) {
  router.push('/vehicles');
  router.refresh();
} else {
  const d = await res.json().catch(() => ({}));
  setArchiveError(d.error ?? 'שגיאה בהעברה לארכיון — נסה שנית');
}
```

**נוסף ב-JSX** (מתחת לכפתור "העבר לארכיון"):
```tsx
{archiveError && (
  <p className="text-xs text-red-600 mt-2">{archiveError}</p>
)}
```

---

## בדיקות שעודכנו (Phase B)

| בדיקה | לפני (Phase A) | אחרי (Phase B) |
|-------|-----------------|-----------------|
| V28 | צפה ל-405 (מאמת באג) | צפה ל-200 + body.id |
| V29 | צפה ל-"שגיאת תקשורת" | צפה לסגירת טופס עריכה |
| V33 | צפה לכשל שקט (רכב נשאר) | צפה לניתוב ל-/vehicles + רכב לא ברשימה |
| V34 | צפה למערך (רשימה) | צפה לאובייקט יחיד עם id |

---

## קבצים שתוקנו

| קובץ | פעולה |
|------|--------|
| `app/api/vehicles/[id]/route.ts` | נכתב מחדש — GET/PATCH/DELETE |
| `components/vehicles/VehicleDetail.tsx` | נוסף archiveError state + הצגת שגיאה |
| `tests/vehicles/vehicles.spec.ts` | עדכון V28, V29, V33, V34 + הערות cleanup |
