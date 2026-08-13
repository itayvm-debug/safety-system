# QA Session 04 — Lifting Equipment — Phase A Findings

**Date:** 2026-08-08  
**Module:** Lifting Equipment (`/lifting-equipment`)  
**QA engineer:** Claude (automated)  
**Session phase:** A — Exploration & Bug Discovery  
**Scope:** Internal QA / Company B only. No Company A / SafeDoc data touched.

---

## Executive Summary

Two critical architectural bugs were found that mirror defects previously reported in Vehicles (QA02) and Heavy Equipment (QA03). Every UI mutation in the Lifting Equipment module silently fails or shows `alert('שגיאה')`. Appointments per-item operations are entirely non-functional for a different but structurally identical reason.

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High     | 3 |
| Medium   | 2 |
| Low      | 1 |

---

## Application Bugs

---

### BUG B-01 — CRITICAL

**ID:** LE-B-01  
**Severity:** Critical  
**Route:** `app/api/lifting-equipment/[id]/route.ts`  
**Also affects:** All PATCH/DELETE mutations from UI (edit, archive, toggle, expiry, file upload, image upload)

#### Description

`app/api/lifting-equipment/[id]/route.ts` is a character-for-character copy of `app/api/lifting-equipment/route.ts` (the collection route). Both files are 47 lines and identical. The `[id]` route never reads the `id` route parameter. This is the same defect found in:

- Vehicles: `app/api/vehicles/[id]/route.ts` (QA02)
- Heavy Equipment: `app/api/heavy-equipment/[id]/route.ts` (QA03, fixed in Phase B)

#### Root cause

Developer copied the collection route file to create the `[id]` route and forgot to replace the content with per-item handlers.

#### HTTP behavior

| Method | Expected | Actual |
|--------|----------|--------|
| `GET /api/lifting-equipment/{id}` | 200 — single object `{id, description, …}` | 200 — full company array (id param ignored) |
| `PATCH /api/lifting-equipment/{id}` | 200 — updated object | **405 Method Not Allowed** |
| `DELETE /api/lifting-equipment/{id}` | 200 — `{success: true}` | **405 Method Not Allowed** |
| `POST /api/lifting-equipment/{id}` | 405 (not a valid operation) | **201 — creates a brand-new item** (id param ignored, collection POST runs) |

#### Cascade failures (UI)

| Feature | Component | Expected behavior | Actual behavior |
|---------|-----------|-------------------|-----------------|
| Edit form submit | `LiftingForm.tsx:36` | PATCH → 200 → navigate to detail | PATCH → 405 → `setError('שגיאה')` → stays on edit page |
| Archive | `LiftingEquipmentDetail.tsx:158-164` | PATCH → 200 → `router.push('/lifting-equipment')` | PATCH → 405 → `alert('שגיאה')`, no navigation, `is_archived` unchanged |
| Toggle is_active (list) | `LiftingEquipmentList.tsx:38-54` | PATCH → 200 → setEq(updated), router.refresh | PATCH → 405 → optimistic flip reverts, `is_active` unchanged in DB |
| Toggle is_active (detail) | `LiftingEquipmentDetail.tsx:143-153` | PATCH → 200 → `setEq(data)` | PATCH → 405 → silent failure, no error state, `is_active` unchanged |
| Save inspection expiry | `LiftingEquipmentDetail.tsx:130-141` | PATCH → 200 → `setSaveSuccess(true)`, float bar hides | PATCH → 405 → float bar **persists** (no `saveSuccess`), `inspection_expiry` unchanged |
| Inspection file upload | `LiftingEquipmentDetail.tsx:167-178` | PATCH → 200 → `setEq(data)` | PATCH → 405 → `setFileError('שגיאה')` shown |
| Image upload | `LiftingImageUploader` (line 38-43) | PATCH → 200 → `onUploaded(path)` | PATCH → 405 → image silently not saved (no error shown on PATCH failure) |

#### Reproduction steps

```bash
# Direct API verification
curl -X PATCH http://localhost:3000/api/lifting-equipment/<uuid> \
  -H "Content-Type: application/json" \
  -H "Cookie: <auth-cookie>" \
  -d '{"description":"updated"}'
# → HTTP/1.1 405 Method Not Allowed

curl -X GET http://localhost:3000/api/lifting-equipment/<uuid> \
  -H "Cookie: <auth-cookie>"
# → Returns array of all equipment, not single object
```

#### Additional observation: vitest isolation tests pass despite unfixed route

`lib/lifting-equipment/__tests__/isolation.test.ts` contains 24 tests that verify ownership checks. These tests mock the helper functions directly, not the actual route handler. Since `[id]/route.ts` doesn't implement ownership checking (it runs the collection route's handlers), the vitest tests present a **false sense of safety** — they test a code path that is never invoked in production.

**Suggested priority:** P0 — Fix immediately. Implement `GET`, `PATCH`, `DELETE` handlers in `[id]/route.ts` following the pattern established in `heavy-equipment/[id]/route.ts` (Phase B fix from QA03).

---

### BUG B-02 — CRITICAL

**ID:** LE-B-02  
**Severity:** Critical  
**Route:** `app/api/lifting-machine-appointments/[id]/route.ts`

#### Description

`app/api/lifting-machine-appointments/[id]/route.ts` is a copy of `app/api/lifting-machine-appointments/generate-pdf/route.ts`. Both files return the same content. The `[id]` route only exports `POST`, and that POST handler implements PDF generation (requires `appointment_id` and `overlay_image_b64` in the body), not appointment CRUD.

#### HTTP behavior

| Method | Expected | Actual |
|--------|----------|--------|
| `GET /api/lifting-machine-appointments/{id}` | 200 — single appointment object | **405 Method Not Allowed** |
| `PATCH /api/lifting-machine-appointments/{id}` | 200 — updated appointment | **405 Method Not Allowed** |
| `DELETE /api/lifting-machine-appointments/{id}` | 200 — `{success: true}` | **405 Method Not Allowed** |
| `POST /api/lifting-machine-appointments/{id}` | 405 (not a valid operation) | **Runs generate-pdf handler** — returns 400 "appointment_id ו-overlay_image_b64 נדרשים" |

#### Reproduction steps

```bash
curl -X GET http://localhost:3000/api/lifting-machine-appointments/<uuid> \
  -H "Cookie: <auth-cookie>"
# → HTTP/1.1 405 Method Not Allowed

curl -X POST http://localhost:3000/api/lifting-machine-appointments/<uuid> \
  -H "Content-Type: application/json" \
  -H "Cookie: <auth-cookie>" \
  -d '{}'
# → HTTP/1.1 400 {"error":"appointment_id ו-overlay_image_b64 נדרשים"}
```

**Suggested priority:** P0 — Fix by replacing `[id]/route.ts` content with proper GET, PATCH, DELETE handlers.

---

### BUG B-03 — HIGH

**ID:** LE-B-03  
**Severity:** High  
**Component:** `LiftingEquipmentDetail.tsx:155-165` — `handleDelete`

#### Description

`handleDelete` uses `alert('שגיאה')` for error display, which is the old pattern. In Heavy Equipment (Phase B fix), this was replaced with an inline error state and no navigation. In Lifting Equipment, the old `alert()` pattern remains.

Additionally, `handleDelete` has no `try/catch` block. If `fetch()` rejects (network error), the resulting unhandled promise rejection is not caught; the button stays in `deleting=true` state indefinitely (no `finally` block).

```typescript
// Current (buggy):
async function handleDelete() {
  if (!confirm(`להעביר את "${eq.description}" לארכיון?`)) return;
  setDeleting(true);
  const res = await fetch(`/api/lifting-equipment/${eq.id}`, { method: 'PATCH', … });
  if (res.ok) { router.push('/lifting-equipment'); router.refresh(); }
  else { alert('שגיאה'); setDeleting(false); }   // ← old alert + no try/catch
}
```

**Expected:** Inline error state, no `alert()`, `try/finally` to always reset `deleting`.  
**Suggested priority:** P1 — Update to match the HE fixed pattern.

---

### BUG B-04 — HIGH

**ID:** LE-B-04  
**Severity:** High  
**Component:** `LiftingEquipmentDetail.tsx:143-153` — `handleToggleActive`

#### Description

`handleToggleActive` has no error state. When PATCH → 405, the catch is implicit (try/finally, no catch). If `res.json()` throws (empty 405 body), the error escapes silently past `finally`. The toggle returns to its original state (no optimistic update in detail view), but no error is shown to the user.

**Expected:** Show inline error or brief error toast when toggle fails.  
**Suggested priority:** P1.

---

### BUG B-05 — HIGH

**ID:** LE-B-05  
**Severity:** High  
**Component:** `LiftingEquipmentDetail.tsx:130-141` — `handleSaveExpiry`

#### Description

`handleSaveExpiry` has no error state for failure. When PATCH → 405, the float bar remains visible (showing "שינוי תאריך ממתין לשמירה") indefinitely — no error message, no dismissal. The user has no indication that the save failed.

Additionally: the `hasPending || saveSuccess` condition for the float bar (line 275) does not include a `saveError` condition. Even if an error state were added, the float bar would not display it.

**Expected:** `saveError` state + float bar shows error message on failure + button re-enables.  
**Suggested priority:** P1.

---

### BUG B-06 — MEDIUM

**ID:** LE-B-06  
**Severity:** Medium  
**Component:** `LiftingImageUploader.uploadBlob` (line 37-43)

#### Description

When the image `upload` succeeds but the subsequent PATCH to save `image_url` fails (→ 405), the function silently returns without informing the user. The image was uploaded to storage but the DB record is not updated. There is no `catch` or error branch after the PATCH call (only `if (res.ok) {...}`).

```typescript
if (res.ok) {
  onUploaded(ud.path);
  // …signed URL fetch
}
// If !res.ok: nothing happens — image in storage, DB not updated
```

**Expected:** Show error when PATCH fails after image upload.  
**Suggested priority:** P2.

---

### BUG B-07 — MEDIUM

**ID:** LE-B-07  
**Severity:** Medium  
**Route:** `app/api/lifting-equipment/route.ts` — POST handler (collection)

#### Description

The POST handler does not validate that `subcontractor_id` belongs to the same company. A user can supply any subcontractor UUID (including one from another company) and the system will insert it without verification.

`lib/lifting-equipment/__tests__/isolation.test.ts` (Scenario 13) includes a `subcontractorBelongsToCompany` helper function that appears to test this check — but the actual POST route never calls this helper. The vitest test passes because it tests the helper in isolation, not the route.

**Suggested priority:** P2 — Add ownership check for `subcontractor_id` in POST handler.

---

### BUG B-08 — LOW

**ID:** LE-B-08  
**Severity:** Low  
**Component:** `LiftingEquipmentDetail.tsx` — `handleDeleteFile`

#### Description

`handleDeleteFile` (line 180-188) lacks a `try/catch` block. If the PATCH call throws (network error), the button stays in whatever state it was without resetting. Same pattern as B-03.

**Suggested priority:** P3.

---

## Test Infrastructure Issues

### TI-01 — Windows bracket-path resolution

`app/api/lifting-machine-appointments/[id]/route.ts` cannot be read by PowerShell `Get-Content` (with or without `-LiteralPath`) or by the Bash `cat` command — both resolve to `generate-pdf/route.ts` content. This was confirmed to be the actual file content (not a tool bug) by cross-referencing both tools returning identical generate-pdf content and by structural analysis of the directory listing.

This is the same Windows glob-expansion issue affecting `[id]` paths with Hebrew characters in the parent path.

**Impact:** Future diff/audit tools that use shell file reads will silently read the wrong file. Use the Read tool (which uses direct filesystem access) or write scripts that escape bracket characters.

### TI-02 — vitest isolation tests create false confidence

`lib/lifting-equipment/__tests__/isolation.test.ts` (24 tests) all pass because they test helper functions (`subcontractorBelongsToCompany`, `getEquipmentForCompany`, etc.) in isolation via mocks. The actual `[id]/route.ts` route handler never calls these helpers (it's a copy of the collection route). This is a structural false-positive in the test suite.

---

## UX Findings

### UX-01 — Old alert() pattern for archive failure

`LiftingEquipmentDetail.handleDelete` uses `alert('שגיאה')` on PATCH failure. This is an inconsistent UX pattern. Heavy Equipment was updated in QA03 Phase B to use inline error state. Lifting Equipment was not updated.

### UX-02 — No image upload error when PATCH fails after upload

After a successful image upload to storage, the silent PATCH failure (B-06) means the user sees their image persist in the UI but it's not actually saved. On page reload, the image disappears with no explanation.

---

## Coverage Map (66 tests)

| Range | Section | Count |
|-------|---------|-------|
| LE-01–LE-10 | List page basics | 10 |
| LE-11–LE-20 | Create / POST | 10 |
| LE-21–LE-28 | Detail page UI | 8 |
| LE-29–LE-33 | API `[id]` route BUG B-01 | 5 |
| LE-34–LE-38 | Edit form | 5 |
| LE-39–LE-44 | Archive | 6 |
| LE-45–LE-49 | Toggle is_active | 5 |
| LE-50–LE-55 | Inspection / Expiry | 6 |
| LE-56–LE-60 | Search & Filter | 5 |
| LE-61–LE-66 | Appointments API BUG B-02 | 6 |
| **Total** | | **66** |

---

## Files Audited

| File | Finding |
|------|---------|
| `app/api/lifting-equipment/route.ts` | Collection route — GET + POST. Correct. |
| `app/api/lifting-equipment/[id]/route.ts` | **BUG B-01** — Identical copy of collection route. |
| `app/api/lifting-machine-appointments/route.ts` | GET + POST. Correct. |
| `app/api/lifting-machine-appointments/[id]/route.ts` | **BUG B-02** — Copy of generate-pdf route. |
| `app/api/lifting-machine-appointments/generate-pdf/route.ts` | PDF generation only. Correct. |
| `components/lifting-equipment/LiftingEquipmentDetail.tsx` | Multiple cascade failures from B-01; old alert() pattern (B-03/B-04/B-05/B-06/B-08). |
| `components/lifting-equipment/LiftingEquipmentList.tsx` | Optimistic toggle — reverts correctly on error. |
| `components/lifting-equipment/LiftingForm.tsx` | Correct error handling. Shows inline error on PATCH failure. |
| `app/lifting-equipment/page.tsx` | Correct. |
| `app/lifting-equipment/[id]/page.tsx` | SSR — correct (uses service client, not affected by B-01). |
| `app/lifting-equipment/[id]/edit/page.tsx` | SSR — correct. |
| `app/lifting-equipment/new/page.tsx` | Correct. |
| `lib/lifting-equipment/__tests__/isolation.test.ts` | All 24 pass — **but test a code path never exercised by the real route (TI-02)**. |

---

## Bug Priority Summary

| Bug | Severity | Component | Status |
|-----|----------|-----------|--------|
| B-01 | Critical | `lifting-equipment/[id]/route.ts` | Not fixed |
| B-02 | Critical | `lifting-machine-appointments/[id]/route.ts` | Not fixed |
| B-03 | High | `LiftingEquipmentDetail.handleDelete` | Not fixed |
| B-04 | High | `LiftingEquipmentDetail.handleToggleActive` | Not fixed |
| B-05 | High | `LiftingEquipmentDetail.handleSaveExpiry` | Not fixed |
| B-06 | Medium | `LiftingImageUploader.uploadBlob` | Not fixed |
| B-07 | Medium | `lifting-equipment/route.ts` POST — subcontractor ownership | Not fixed |
| B-08 | Low | `LiftingEquipmentDetail.handleDeleteFile` | Not fixed |

---

*End of Phase A findings. Phase B (fix) and Phase C (regression verification) are pending.*
