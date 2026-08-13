# QA Carry-Forward Findings

Security and functional defects identified during QA sessions that are explicitly **deferred** to a dedicated future session.
Do not fix these findings in the session that discovered them unless the finding description says otherwise.

---

## ~~CF-01 — CRITICAL / CROSS-TENANT SECURITY~~ — RESOLVED

**Resolved in:** QA Session 05 Phase B

`app/api/subcontractors/[id]/route.ts` was fully rewritten with correct GET/PATCH/DELETE semantics and tenant isolation. POST on the `[id]` route now returns 405. Verified in Phase C — all regression tests pass.

---

## CF-02 — FUNCTIONAL DEFECT / [id] ROUTE COPY

**File:** `app/api/entity-notes/[id]/route.ts`

**Discovered in:** QA Session 05 Phase C (dynamic-route audit)

**Status:** RESOLVED in QA Session 05 Phase C

### Finding

`app/api/entity-notes/[id]/route.ts` was a copy of the collection route (`app/api/entity-notes/route.ts`). The `[id]` segment was unused in the GET and POST handlers. PATCH and DELETE handlers were missing entirely.

`EntityNotesButton` calls:
- `PATCH /api/entity-notes/{noteId}` — returned 405 (no handler) — note editing broken
- `DELETE /api/entity-notes/{noteId}` — returned 405 (no handler) — note deletion broken

### Impact

| Severity | Reason |
|----------|--------|
| Functional: **HIGH** | Note editing and deletion silently failed for all entity types (workers, vehicles, HE, LE, subcontractors) |
| Security: **NONE** | The missing handlers only returned 405; no data was exposed or mutated incorrectly |

### Resolution

`app/api/entity-notes/[id]/route.ts` was rewritten with correct PATCH and DELETE handlers:
- Both handlers use `requireCompanyAdminRole()` and scope queries with `.eq('company_id', companyId)`
- Fetch note by ID first; return 404 if not found or cross-company
- PATCH validates content (non-empty) and status (enum: ok | needs_attention)
- DELETE verifies ownership before deletion

Regression tests added: SUB-77 (PATCH 200), SUB-78 (DELETE 200), SUB-79 (PATCH cross-company 404), SUB-80 (DELETE cross-company 404). All pass.

---

## ~~Open Findings — Session 06~~ — הכל נפתר ב-Session 06 Phase B

### ~~CF-PL-01~~ — RESOLVED in QA Session 06 Phase B

**קובץ:** `app/api/professional-licenses/[id]/route.ts`  
**התגלה ב:** QA Session 06 Phase A (WC-54, WC-55)  
**נפתר ב:** QA Session 06 Phase B

GET מחזיר רשומה בודדת לפי `id` + two-hop ownership check (license → worker → company_id). POST מחזיר 405. WC-54/WC-55 עודכנו לאשר התנהגות נכונה.

---

### ~~CF-ML-01~~ — RESOLVED in QA Session 06 Phase B

**קובץ:** `app/api/manager-licenses/[id]/route.ts`  
**התגלה ב:** QA Session 06 Phase A (WC-56, WC-57)  
**נפתר ב:** QA Session 06 Phase B

זהה ל-CF-PL-01. WC-56/WC-57 עודכנו.

---

### ~~B-SB-TZ~~ — RESOLVED in QA Session 06 Phase B

**קובץ:** `app/api/safety-briefings/route.ts`  
**התגלה ב:** QA Session 06 Phase A (WC-07)  
**נפתר ב:** QA Session 06 Phase B

```ts
// תיקון:
const [year, month, day] = briefed_at.split('-');
const expiresAt = `${parseInt(year) + 1}-${month}-${day}`;
```

WC-07 מדויק עכשיו (exact date). WC-07b ו-WC-07c (regression) נוספו.

---

### ~~B-UI-SB~~ — RESOLVED in QA Session 06 Phase B

**קובץ:** `components/workers/SafetyBriefingCard.tsx`  
**נפתר ב:** QA Session 06 Phase B — inline confirmation UI עם `confirmDelete` state.

---

### ~~B-UI-PL~~ — RESOLVED in QA Session 06 Phase B

**קובץ:** `components/workers/ProfessionalLicensesCard.tsx` (LicenseRow)  
**נפתר ב:** QA Session 06 Phase B — inline confirmation UI.

---

### ~~B-UI-ML~~ — RESOLVED in QA Session 06 Phase B

**קובץ:** `components/workers/ManagerDocumentsCard.tsx` (ManagerFileRow)  
**נפתר ב:** QA Session 06 Phase B — inline confirmation UI.

---

### ~~B-UI-HR~~ — RESOLVED in QA Session 06 Phase B

**קובץ:** `components/workers/HeightBanCard.tsx`  
**נפתר ב:** QA Session 06 Phase B — inline confirmation UI.

---

### ~~UI-NOTE-01~~ — RESOLVED in QA Session 06 Phase B

**קובץ:** `components/EntityNotesButton.tsx`  
**נפתר ב:** QA Session 06 Phase B — inline confirmation UI עם `confirmDeleteId` state (per-note).

---

### ~~vehicle [id] audit notes~~ — RESOLVED in QA Session 06 Phase B

**קבצים:** `vehicle-insurances/[id]/route.ts`, `vehicle-licenses/[id]/route.ts`  
**נפתר ב:** QA Session 06 Phase B — GET מחזיר רשומה בודדת + company_id filter. POST מחזיר 405. בדיקות V61–V64 נוספו.

---

## אין ממצאים פתוחים

*כל הממצאים מ-Session 01 עד Session 06 נפתרו. אין carry-forward ל-Session 07.*
