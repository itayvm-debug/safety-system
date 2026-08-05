# Phase 3 Batch 3 — ביקורת דליפת Tenant ועיצוב מחדש

## עמודים + API — מטריצת בקרה מלאה

| קובץ | שאילתה / API | מקור company_id | נקודת כשל לפני | תוקן? | הערות |
|------|-------------|-----------------|----------------|--------|--------|
| `app/dashboard/page.tsx` | `workers` | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/dashboard/page.tsx` | `vehicles` | — | ❌ **חסר** | ✅ תוקן | נוספה `.eq('company_id', companyId)` |
| `app/dashboard/page.tsx` | `heavy_equipment` | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/dashboard/page.tsx` | `lifting_equipment` | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/dashboard/page.tsx` | `entity_notes` | — | ❌ **חסר** | ✅ תוקן | נוספה `.eq('company_id', companyId)` |
| `app/dashboard/page.tsx` | `subcontractors` | — | ❌ **חסר** | ✅ תוקן | נוספה `.eq('company_id', companyId)` |
| `app/dashboard/page.tsx` | `site_feedback` | — (טבלת פלטפורמה) | ⚠️ חשיפת ספירה | ✅ תוקן | מוצג רק ל-platform admin; אחרים מקבלים 0 |
| `app/issues/page.tsx` | `workers` | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/issues/page.tsx` | `vehicles` | — | ❌ **חסר** | ✅ תוקן | נוספה `.eq('company_id', companyId)` |
| `app/issues/page.tsx` | `heavy_equipment` | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/issues/page.tsx` | `lifting_equipment` | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/issues/page.tsx` | `entity_notes` | — | ❌ **חסר** | ✅ תוקן | נוספה `.eq('company_id', companyId)` |
| `app/issues/page.tsx` | `subcontractors` | — | ❌ **חסר** | ✅ תוקן | נוספה `.eq('company_id', companyId)` |
| `app/archive/page.tsx` | `workers` | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/archive/page.tsx` | `vehicles` | — | ❌ **חסר** | ✅ תוקן | נוספה `.eq('company_id', companyId)` |
| `app/archive/page.tsx` | `heavy_equipment` | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/archive/page.tsx` | `lifting_equipment` | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/archive/page.tsx` | `subcontractors` | — | ❌ **חסר** | ✅ תוקן | נוספה `.eq('company_id', companyId)` |
| `app/subcontractors/page.tsx` | `subcontractors` | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/vehicles/page.tsx` | (client component → `/api/vehicles`) | server API | ✅ תקין | — | VehicleList → fetch API |
| `app/api/vehicles/route.ts` | `vehicles` | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/api/subcontractors/route.ts` | `subcontractors` | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/api/entity-notes/route.ts` | `entity_notes` | `getCurrentCompanyContext()` + `resolveEntityCompany` | ✅ תקין | — | |
| `app/api/alerts/route.ts` | `vehicles`, `workers`, etc. | `getCurrentCompanyContext()` | ✅ תקין | — | |
| `app/api/site-feedback/route.ts` | `site_feedback` | `requireAdmin()` (platform-wide) | ✅ תקין | — | טבלת פלטפורמה; אין company_id בכוונה |

---

## סיכום דליפות שתוקנו

| טבלה | דפים שדלפו | תיקון |
|------|------------|--------|
| `vehicles` | dashboard, issues, archive | `.eq('company_id', companyId)` |
| `entity_notes` | dashboard, issues | `.eq('company_id', companyId)` |
| `subcontractors` | dashboard, issues, archive | `.eq('company_id', companyId)` |
| `site_feedback` | dashboard (ספירה בלבד) | שאילתה מותנית: רק לplatform admin |

**סה"כ 8 שאילתות דולפות תוקנו ב-3 קבצים.**

---

## Cache Isolation

כל דפי ה-server component מוגדרים עם `export const dynamic = 'force-dynamic'`.  
`getCurrentCompanyContext()` מקרא את ה-cookie `safedoc_active_company` מחדש בכל request.  
מיתוג חברה (POST `/api/session/company`) + `window.location.replace()` מבצעים navigation מלא,  
מה שמבטיח שאין state ישן משמר בין חברות.

---

## עיצוב מחדש — שינויים

| רכיב | לפני | אחרי |
|------|------|-------|
| לוגו פלטפורמה | `/logo.png` (לוגו חברה) | `/safedoc-logo.png` (SafeDoc brand) |
| NavBar — זיהוי חברה | שם בלבד (טקסט) | אייקון/initials + שם + separator ויזואלי |
| NavBar — מובייל | "SafeDoc" בלבד | "SafeDoc" + שם החברה הפעילה |
| לוגו חברה שבור | תמונה שבורה | fallback אוטומטי ל-initials (`onError`) |
| `/select-company` | כרטיסיות בסיסיות | header פלטפורמה + avatars + role badges |
| `/login` | `/logo.png` | `/safedoc-logo.png` |

---

## קבצים שנוצרו/שונו — Phase 3 Batch 3

**תיקוני אבטחה:**
- `app/dashboard/page.tsx` — 3 שאילתות תוקנו + site_feedback מותנה
- `app/issues/page.tsx` — 3 שאילתות תוקנו
- `app/archive/page.tsx` — 2 שאילתות תוקנו

**עיצוב מחדש:**
- `public/safedoc-logo.png` — SafeDoc LOGO.png (הועתק מ-Downloads)
- `app/login/page.tsx` — לוגו SafeDoc
- `app/select-company/SelectCompanyClient.tsx` — עיצוב מחדש + fallback לוגו
- `components/NavBar.tsx` — לוגו פלטפורמה + company avatar + mobile company name

**בדיקות:**
- `app/dashboard/__tests__/cross-tenant-regression.test.ts` — 11 CT tests (CT1–CT10)
- `vitest.config.ts` — הרחבת include ל-`app/**/__tests__/**`

**אבחון:**
- `supabase/phase3_verify_cross_tenant_data.sql` — diagnostic SQL (read-only)
