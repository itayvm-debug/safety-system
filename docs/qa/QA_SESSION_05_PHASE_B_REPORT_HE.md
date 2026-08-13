# QA Session 05 — Phase B: Final Report

**תאריך:** 2026-08-10  
**שלב:** Phase B — Subcontractors + subcontractor_id Security Hardening  
**סטטוס:** COMPLETE ✓

---

## סיכום מנהלים

Phase B תיקן את כל 9 הממצאים שאושרו ב-Phase A. כל שערי האימות עברו. לא הוחלשו בדיקות, לא נוצרו תכונות חדשות, ולא בוצעו mutations על Company A.

---

## ממצאים שתוקנו

### CF-01 — Critical | `app/api/subcontractors/[id]/route.ts` — נוצר מחדש במלואו

**בעיה:** הקובץ היה עותק של `route.ts` של ה-collection — GET התעלם מה-`id`, POST יצר רשומות חדשות, לא היה PATCH/DELETE.

**תיקון:** נכתב מחדש לחלוטין:
- `GET` — מחזיר רשומה בודדת מוגבלת ל-`company_id` + `id`, או 404
- `PATCH` — whitelist שדות, בדיקת `responsible_worker_id` לאותה חברה, עדכון `archived_at` בעת ארכוב/שחזור
- `DELETE` — מחייב `is_archived=true` תחילה (409 אחרת), מסיר `entity_notes`, ואז מוחק
- `POST` — לא מוגדר → 405 אוטומטי מ-Next.js

**קבצים:** `app/api/subcontractors/[id]/route.ts`

---

### SEC-01 — High | HE POST: בדיקת ownership על `subcontractor_id`

**בעיה:** `POST /api/heavy-equipment` קיבל כל `subcontractor_id` ללא בדיקה — כולל IDs של Company A.

**תיקון:** הוסף קריאה ל-`validateSubcontractorOwnership` לפני ה-insert. מחזיר 404 ל-ID שאינו שייך לחברה.

**קבצים:** `app/api/heavy-equipment/route.ts`, `lib/subcontractors/ownership.ts` (חדש)

---

### SEC-02 — High | HE PATCH: בדיקת ownership על `subcontractor_id`

**בעיה:** `PATCH /api/heavy-equipment/[id]` קיבל כל `subcontractor_id` ללא בדיקה.

**תיקון:** בדיקת ownership כשה-body מכיל `subcontractor_id !== undefined`.

**קבצים:** `app/api/heavy-equipment/[id]/route.ts`

---

### SEC-03 — High | Worker PATCH: בדיקת ownership על `subcontractor_id`

**בעיה:** `PATCH /api/workers/[id]` כלל `subcontractor_id` ב-`PATCH_ALLOWED` ללא בדיקת ownership.

**תיקון:** בדיקת ownership אחרי בניית ה-patch ולפני עדכון ה-DB.

**קבצים:** `app/api/workers/[id]/route.ts`

---

### SEC-04 — High | LE PATCH: בדיקת ownership על `subcontractor_id`

**בעיה:** `PATCH /api/lifting-equipment/[id]` לא בדק ownership (שלא כמו LE POST שכבר תוקן ב-B-07).

**תיקון:** בדיקת ownership כשה-body מכיל `subcontractor_id !== undefined`.

**קבצים:** `app/api/lifting-equipment/[id]/route.ts`

---

### B-ERR-01 — Low | FK violation מחזיר 500 במקום 4xx

**בעיה:** ללא בדיקת ownership, UUID לא-קיים גרם ל-FK constraint → 500.

**תיקון:** נפתר באופן אוטומטי ע"י SEC-01–04 — בדיקת ownership רצה לפני ה-DB mutation ומחזירה 404 לפני שה-FK בכלל מופעל.

---

### B-UI-01 — High | `window.confirm()` בכפתור ארכוב

**בעיה:** `SubcontractorList` השתמש ב-`window.confirm()` — חסום ב-Playwright וחוסר עקביות עם שאר ה-UI.

**תיקון:** הוחלף ב-inline confirmation row המופיע בתוך כרטיס הקבלן:
```
להעביר את "[שם]" לארכיון? | [העבר לארכיון] [ביטול]
```

**קבצים:** `components/subcontractors/SubcontractorList.tsx`

---

### B-UI-02 — High | `window.alert('שגיאה')` על כשל ארכוב

**בעיה:** כשל ב-PATCH הציג `window.alert('שגיאה')` במקום הודעת שגיאה inline.

**תיקון:** state חדש `archiveError` — הודעת שגיאה מוצגת בתוך ה-inline confirmation row.

**קבצים:** `components/subcontractors/SubcontractorList.tsx`

---

### B-UI-03 — Medium | Optimistic update לא הופך לאחור בכשל ב-`ResponsibleWorkerSelector`

**בעיה:** `handleChange` עדכן את ה-state אופטימיסטית לפני קבלת תשובת השרת — כשל לא הפך את הבחירה.

**תיקון:** שמירת `prevId` לפני העדכון האופטימיסטי; על כשל — `setSelectedId(prevId)` + הצגת שגיאה inline.

**קבצים:** `components/subcontractors/SubcontractorList.tsx`

---

## Helper חדש: `lib/subcontractors/ownership.ts`

```typescript
validateSubcontractorOwnership(companyId, subcontractorId)
  → { valid: true }          // null/undefined: מאפשר הסרת השיוך
  → { valid: true }          // קיים ושייך לחברה
  → { valid: false, error }  // לא קיים או שייך לחברה אחרת → 404
```

Pattern זהה ל-`lib/auth/company-context.ts`. משמש ב-4 routes: HE POST, HE PATCH, Worker PATCH, LE PATCH.

---

## ביקורת `subcontractor_id` בכל ה-codebase

| Route | פעולה | סטטוס |
|-------|--------|--------|
| `lifting-equipment/route.ts` POST | בדיקת ownership | קיים לפני Phase B (B-07) |
| `heavy-equipment/route.ts` POST | בדיקת ownership | **תוקן** SEC-01 |
| `heavy-equipment/[id]/route.ts` PATCH | בדיקת ownership | **תוקן** SEC-02 |
| `workers/[id]/route.ts` PATCH | בדיקת ownership | **תוקן** SEC-03 |
| `lifting-equipment/[id]/route.ts` PATCH | בדיקת ownership | **תוקן** SEC-04 |
| `subcontractors/[id]/route.ts` PATCH | בדיקת `responsible_worker_id` | **תוקן** CF-01 |
| `workers/route.ts` GET | סינון בלבד (read-only) | בטוח |
| `alerts/route.ts` | JOIN בלבד (read-only) | בטוח |
| `reports/weekly-status/route.ts` | JOIN בלבד (read-only) | בטוח |

---

## שינויי בדיקות

כל 76 הבדיקות ב-`subcontractors.spec.ts` עודכנו מ-"bug-verification assertions" ל-"correct-behavior assertions":

| טווח | שינוי עיקרי |
|------|-------------|
| SUB-01–08, 12 | CRUD ב-`[id]` route — ציפיות מתוקנות (GET בודד, 405 על POST, PATCH/DELETE עם לוגיקה נכונה) |
| SUB-22–25 | UI — inline confirm, ללא native dialog, cancel עובד |
| SUB-35 | ארכוב קבלן שומר reference ב-HE |
| SUB-40–41 | cross-tenant GET → 404, POST [id] → 405 |
| SUB-43–46 | SEC-01–04 — cross-company sub_id → 404 (במקום 201/200/500) |
| SUB-68 | CF-01 UI — edit form נסגר לאחר PATCH 200 |
| SUB-72 | SEC-01 — same-company sub עדיין עובר (201) |
| SUB-73–74 | SEC-04/03 — fake sub_id → 404 (במקום 500) |
| SUB-75–76 | CF-01 — collection מחזיר array, [id] מחזיר object בודד; POST [id] → 405 |

---

## תיקוני TypeScript ו-Tests

- `lib/subcontractors/ownership.ts` — נוצר (חסר מהדיסק)
- `app/api/subcontractors/[id]/route.ts` — תוקן: `updates: Record<string, unknown>` במקום `patch` לשדה `archived_at`
- `app/api/workers/__tests__/[id].lifecycle.test.ts` — הוסף `maybeSingle` ל-mock chain
- `tests/heavy-equipment/heavy-equipment.spec.ts` — הוסף טיפוסים `Dialog`, `ConsoleMessage`
- `tests/subcontractors/subcontractors.spec.ts` — הוסף טיפוס `Dialog`; תוקן locator ב-SUB-23

---

## תוצאות שערי אימות

| שלב | תוצאה |
|-----|--------|
| `npm run lint` | ✅ 0 errors (7 warnings קיימים-מראש) |
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx next build` | ✅ הצליח |
| `npx vitest run` | ✅ 465/465 passed |
| Playwright — subcontractors | ✅ 71 passed, 5 skipped, 0 failed |
| Playwright — lifting-equipment | ✅ 76 passed, 0 failed |
| Playwright — heavy-equipment | ✅ 65 passed, 0 failed |
| Playwright — vehicles | ✅ 60 passed, 0 failed |
| Playwright — workers | ✅ 60 passed, 0 failed |

**סה"כ Playwright: 332 passed, 5 skipped, 0 failed**

---

## אילוצי בטיחות — אישור

- ✅ לא בוצעו mutations על Company A / SafeDoc
- ✅ כל הרשומות שנוצרו השתמשו בפרפיקס `QA-SUB-<timestamp>-<seq>`
- ✅ לא בוצע commit / push / deploy
- ✅ cleanup לרשומות QA בלבד
- ✅ הבדיקות לא הוחלשו

---

## קבצים שהשתנו

```
lib/subcontractors/ownership.ts                          ← נוצר
app/api/subcontractors/[id]/route.ts                     ← נכתב מחדש (CF-01)
app/api/heavy-equipment/route.ts                         ← SEC-01
app/api/heavy-equipment/[id]/route.ts                    ← SEC-02
app/api/workers/[id]/route.ts                            ← SEC-03
app/api/lifting-equipment/[id]/route.ts                  ← SEC-04
components/subcontractors/SubcontractorList.tsx          ← B-UI-01/02/03
tests/subcontractors/subcontractors.spec.ts              ← כל הבדיקות עודכנו
app/api/workers/__tests__/[id].lifecycle.test.ts         ← mock תוקן
tests/heavy-equipment/heavy-equipment.spec.ts            ← טיפוסי TypeScript
docs/qa/QA_SESSION_05_PHASE_B_REPORT_HE.md              ← דוח זה
```
