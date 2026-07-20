# SafeDoc — Source of Truth Audit
> נוצר: 2026-07-18 | Final Consolidated Production-Readiness Session  
> **בדיקה עצמאית. אינה תחליף ל-Penetration Test מקצועי.**

---

## 1. גרסאות ספריות

| רכיב | גרסה | מקור |
|------|-------|-------|
| Next.js | 16.2.2 | package.json |
| React | 19.2.4 | package.json |
| @supabase/supabase-js | 2.102.1 | package.json |
| @supabase/ssr | 0.10.0 | package.json |
| TypeScript | ^5 | package.json (devDep) |
| Tailwind CSS | ^4 | package.json (devDep) |
| date-fns | ^4.1.0 | package.json |
| resend | ^6.12.3 | package.json |
| pdf-lib | ^1.17.1 | package.json |
| jspdf | ^4.2.1 | package.json |
| xlsx | ^0.18.5 | package.json |

---

## 2. מנגנוני Authentication

### VERIFIED — מנגנון ראשי: Username/Password
- **Route:** `POST /api/auth/login`
- **Flow:** identifier → email lookup בprofiles → `supabase.auth.signInWithPassword` → HMAC-SHA256 session token
- **Session:** HMAC-SHA256, signed עם `SESSION_SECRET` מ-ENV
- **Storage:** cookie בלבד (לא Supabase Session)

### VERIFIED — מנגנון משני (Legacy): Phone-based
- **Routes:** `POST /api/auth/check-phone`, `POST /api/auth/phone-login`
- **Flow:** phone → `authorized_phones` → credentials נגזרים → `signInWithPassword` → HMAC session
- **סטטוס:** פעיל — ירושה. לא הוסר. מתועד ב-SECURITY_AUDIT.md

### VERIFIED — Logout
- **Route:** `POST /api/auth/logout`
- **מוחק:** `safedoc_session`, `safedoc_role`, `safedoc_consented` (maxAge=0)

---

## 3. Cookies

| שם Cookie | httpOnly | Secure (prod) | SameSite | Max-Age | תוכן |
|-----------|----------|--------------|----------|---------|------|
| `safedoc_session` | ✅ כן | ✅ כן | Lax | 7 ימים (604800s) | HMAC-SHA256 token |
| `safedoc_role` | ❌ לא | ✅ כן | Lax | 7 ימים | 'admin' \| 'user' |
| `safedoc_consented` | ✅ כן | ✅ כן | Lax | 1 שנה (31536000s) | 'termsVersion\|privacyVersion' |

**הערה:** `ROLE_COOKIE_NAME` אינו HttpOnly בכוונה — ה-client מסתמך עליו ל-UI בלבד. אכיפת הרשאות ב-requireAdmin/requireAuth בלבד.

---

## 4. Session

| פרמטר | ערך | מקור |
|-------|-----|-------|
| Max-Age | 7 ימים | `COOKIE_MAX_AGE = 60*60*24*7` ב-session.ts |
| Idle Timeout | אין | לא מיושם |
| MFA | לא מיושם | ראה docs/security/MFA_IMPLEMENTATION_STATUS_HE.md |
| Secret | `SESSION_SECRET` מ-ENV | ✅ |

---

## 5. תפקידי משתמשים

| Role | הגדרה | מקור |
|------|-------|-------|
| `admin` | גישה מלאה לכל API ו-UI | `profiles.role` |
| `user` | גישה קריאה לרוב; אין גישה ל-/admin | `profiles.role` |

---

## 6. API Routes — מיפוי מלא

### ציבורי (ללא session)

| Route | Method | הגנה | סטטוס |
|-------|--------|------|--------|
| `/api/auth/login` | POST | Rate limit per IP | ✅ VERIFIED |
| `/api/auth/logout` | POST | ציבורי | ✅ VERIFIED |
| `/api/auth/check-phone` | POST | ציבורי | ✅ VERIFIED (legacy) |
| `/api/auth/phone-login` | POST | ציבורי | ✅ VERIFIED (legacy) |
| `/api/reports/weekly-status` | GET | CRON_SECRET header | ✅ VERIFIED |

### Authenticated (admin + user)

| Route | Method | Auth | סטטוס |
|-------|--------|------|--------|
| `/api/workers` | GET, POST | requireAuth/Admin | ✅ |
| `/api/workers/[id]` | GET, PATCH, DELETE | requireAdmin | ✅ |
| `/api/documents` | GET, POST, PATCH | requireAdmin | ✅ |
| `/api/vehicles` | GET, POST | requireAdmin/Auth | ✅ |
| `/api/vehicles/[id]` | GET, PATCH | requireAdmin | ✅ |
| `/api/heavy-equipment` | GET, POST | requireAdmin | ✅ |
| `/api/heavy-equipment/[id]` | GET, PATCH | requireAdmin | ✅ |
| `/api/heavy-equipment-insurances` | GET, POST | requireAdmin | ✅ |
| `/api/heavy-equipment-insurances/[id]` | PATCH, DELETE | requireAdmin | ✅ |
| `/api/lifting-equipment` | GET, POST | requireAdmin | ✅ |
| `/api/lifting-equipment/[id]` | GET, PATCH | requireAdmin | ✅ |
| `/api/lifting-machine-appointments` | GET, POST | requireAdmin | ✅ |
| `/api/lifting-machine-appointments/[id]` | GET, PATCH, DELETE | requireAdmin | ✅ |
| `/api/subcontractors` | GET, POST, PATCH | requireAdmin | ✅ |
| `/api/subcontractors/[id]` | GET, PATCH | requireAdmin | ✅ |
| `/api/signed-url` | GET | requireAuth | ✅ |
| `/api/upload` | POST, DELETE | requireAdmin | ✅ |
| `/api/alerts` | GET | requireAuth | ✅ |
| `/api/safety-briefings` | GET, POST, DELETE | requireAdmin | ✅ |
| `/api/height-restrictions` | GET, POST | requireAdmin | ✅ |
| `/api/entity-notes` | GET, POST | requireAuth | ✅ |
| `/api/entity-notes/[id]` | PATCH, DELETE | requireAuth | ⚠️ כל auth-user יכול למחוק הערה של אחר |
| `/api/vehicle-licenses` | GET, POST | requireAdmin | ✅ |
| `/api/vehicle-licenses/[id]` | PATCH, DELETE | requireAdmin | ✅ |
| `/api/vehicle-insurances` | GET, POST | requireAdmin | ✅ |
| `/api/vehicle-insurances/[id]` | PATCH, DELETE | requireAdmin | ✅ |
| `/api/manager-licenses` | GET, POST | requireAdmin | PARTIALLY VERIFIED |
| `/api/manager-licenses/[id]` | PATCH, DELETE | requireAdmin | PARTIALLY VERIFIED |
| `/api/professional-licenses` | GET, POST | requireAdmin | PARTIALLY VERIFIED |
| `/api/professional-licenses/[id]` | DELETE | requireAdmin | PARTIALLY VERIFIED |
| `/api/legal-consent` | POST | requireAuth | ✅ |
| `/api/site-feedback` | GET (admin), POST (auth) | ✅ | PARTIALLY VERIFIED |
| `/api/site-feedback/[id]` | PATCH, DELETE | requireAdmin | PARTIALLY VERIFIED |
| `/api/ai/extract-worker-identity` | POST | requireAdmin | ✅ |
| `/api/lifting-machine-appointments/generate-pdf` | POST | requireAdmin | ✅ |

### Admin Only

| Route | Method | Auth | סטטוס |
|-------|--------|------|--------|
| `/api/admin/users` | GET, POST | requireAdmin | ✅ |
| `/api/admin/users/[id]` | GET, PATCH, DELETE | requireAdmin | ✅ |
| `/api/admin/users/[id]/reset-password` | POST | requireAdmin | ✅ |
| `/api/admin/audit` | GET | requireAdmin | ✅ |
| `/api/admin/export` | GET | requireAdmin | ✅ (נוצר בסשן זה) |
| `/api/admin/system-health` | GET | requireAdmin | ✅ (נוצר בסשן זה) |
| `/api/health` | GET | ציבורי (מינימלי) | ✅ (נוצר בסשן זה) |

---

## 7. טבלאות DB

| טבלה | RLS | שייך ל | FK לטבלאות | הערות |
|------|-----|-------|------------|-------|
| `authorized_phones` | ✅ | קונפיגורציה | — | SELECT only לauthenticated |
| `profiles` | ✅ | משתמשי מערכת | auth.users | SELECT own only |
| `workers` | ✅ | נתון עסקי | subcontractors | מרכזי |
| `documents` | ✅ | נתון עסקי | workers | ON DELETE CASCADE |
| `subcontractors` | ✅ | נתון עסקי | — | |
| `vehicles` | ✅ | נתון עסקי | workers (assigned_manager) | |
| `vehicle_licenses` | ✅ | נתון עסקי | vehicles | CASCADE |
| `vehicle_insurances` | ✅ | נתון עסקי | vehicles | CASCADE |
| `heavy_equipment` | ✅ | נתון עסקי | subcontractors | |
| `heavy_equipment_insurances` | ✅ | נתון עסקי | heavy_equipment | CASCADE |
| `lifting_equipment` | ✅ | נתון עסקי | subcontractors | |
| `lifting_machine_appointments` | ✅ | נתון עסקי | workers, heavy_equipment | |
| `safety_briefings` | ✅ | נתון עסקי | workers | CASCADE |
| `height_restrictions` | ✅ | נתון עסקי | workers | CASCADE |
| `manager_licenses` | ✅ | נתון עסקי | workers (implied) | PARTIALLY VERIFIED |
| `professional_licenses` | PARTIALLY VERIFIED | נתון עסקי | workers (implied) | |
| `entity_notes` | ✅ | נתון עסקי | polymorphic | entity_type + entity_id |
| `legal_acceptances` | ✅ | compliance | profiles | append-only |
| `audit_logs` | ✅ | לוגים | profiles | append-only |
| `site_feedback` | PARTIALLY VERIFIED | פידבק | — | |
| `manager_insurances` | DEPRECATED | — | — | אינה בשימוש |

---

## 8. Foreign Key Dependencies (לייצוא/שחזור)

```
[ללא תלות]
  authorized_phones
  subcontractors
  profiles

[תלוי ב: subcontractors]
  workers → subcontractors
  heavy_equipment → subcontractors
  lifting_equipment → subcontractors

[תלוי ב: workers]
  documents → workers
  safety_briefings → workers
  height_restrictions → workers
  manager_licenses → workers
  professional_licenses → workers

[תלוי ב: workers + heavy_equipment]
  lifting_machine_appointments → workers, heavy_equipment

[תלוי ב: vehicles]
  vehicle_licenses → vehicles
  vehicle_insurances → vehicles
  vehicles → workers (assigned_manager, nullable)

[תלוי ב: profiles]
  legal_acceptances → profiles
  audit_logs → profiles

[תלוי ב: כל הישויות]
  entity_notes → polymorphic (workers, vehicles, heavy_equipment, lifting_equipment, subcontractors)
```

---

## 9. Storage Buckets

| Bucket | סוג | RLS | שימוש |
|--------|-----|-----|-------|
| `worker-files` | **Private** | ✅ | כל קבצי המערכת — מסמכים, תמונות, חתימות |

**Signed URLs:** תוקף 3600 שניות (1 שעה)  
**Max upload:** 10MB  
**Allowed MIME:** image/jpeg, image/png, image/webp, application/pdf  
**Allowed folders:** documents, photos, briefings, signatures, appointments, heavy-equipment, lifting-equipment, vehicles  

---

## 10. Environment Variables (שמות בלבד)

| שם | נדרש | שימוש |
|----|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | פעולות server-side |
| `SESSION_SECRET` | ✅ | HMAC-SHA256 signing |
| `RESEND_API_KEY` | ✅ | שליחת אימיילים |
| `RESEND_FROM_EMAIL` | ✅ | כתובת שליחה |
| `REPORT_TO_EMAIL` | ✅ | מייל דוחות שבועיים |
| `CRON_SECRET` | ✅ | הגנת Cron endpoint |
| `NODE_ENV` | אוטומטי | production/development |

---

## 11. Cron Jobs

| Cron | Route | תדירות | הגנה |
|------|-------|--------|------|
| Weekly status report | `/api/reports/weekly-status` | שבועי (לפי Vercel config) | CRON_SECRET header |

---

## 12. Upload Flow

1. Client → `POST /api/upload` (requireAdmin)
2. Rate limit: `rateLimitUpload(userId)` — 30 קבצים / 10 דקות
3. Folder allowlist validation
4. MIME type validation
5. File size: max 10MB
6. Filename: `crypto.randomUUID()` based
7. Upload to `worker-files` bucket (Supabase Storage)
8. Return signed URL (3600s)

**ℹ️ Magic bytes validation:** PARTIALLY VERIFIED — לא ניתן לאמת ללא קריאת קוד נוסף

---

## 13. Delete Flow

- **Worker delete:** `DELETE /api/workers/[id]` → ON DELETE CASCADE על documents, safety_briefings, height_restrictions, lifting_machine_appointments
- **Storage delete:** דרך `DELETE /api/upload` או ב-PATCH של document
- **⚠️ Orphan check:** PARTIALLY VERIFIED

---

## 14. Cache / Offline / PWA

- **Service Worker:** קיים (`/sw.js`)
- **Manifest:** `/manifest.json`
- **PwaRegistration:** component קיים
- **OfflineBanner:** component קיים
- **Cache-Control for sw.js:** no-cache, no-store (מוגדר ב-next.config.ts)
- **⚠️ Signed URL caching:** לא נבדק — ייתכן ש-SW מאחסן signed URLs לאחר logout

---

## 15. ספקי חיצוניים

| ספק | שימוש | מיקום | Integration |
|-----|-------|-------|------------|
| Supabase, Inc. | DB + Storage + Auth | Tokyo, Japan (AWS ap-northeast-1) | @supabase/supabase-js |
| Vercel, Inc. | Hosting + Serverless + Cron | Global CDN | next build/deploy |
| Resend, Inc. | Email (דוחות שבועיים) | International | resend npm package |
| Anthropic (Claude API) | AI — זיהוי עובד | US | `/api/ai/extract-worker-identity` |

---

## 16. עמודים ציבוריים

| עמוד | Auth נדרש | מטרה |
|------|-----------|------|
| `/login` | לא | כניסה למערכת |
| `/terms` | לא | תנאי שימוש |
| `/privacy` | לא | מדיניות פרטיות |
| `/accessibility` | לא | הצהרת נגישות |
| `/subprocessors` | לא | ספקי משנה |
| `/data-retention` | לא | שמירה ומחיקה |
| `/about` | לא | אודות המערכת |
| `/legal-consent` | Session חלקי | הסכמה לתנאים |

---

## 17. מסמכים משפטיים

| מסמך | נתיב | גרסה | סטטוס |
|------|------|------|--------|
| תנאי שימוש | `/terms` | 1.0 (עדכון סשן זה) | DRAFT — לא עבר עורך דין |
| מדיניות פרטיות | `/privacy` | 1.0 (עדכון סשן זה) | DRAFT — לא עבר עורך דין |
| הצהרת נגישות | `/accessibility` | 1.0 (עדכון סשן זה) | DRAFT — לא עבר מוסמך נגישות |
| ספקי משנה | `/subprocessors` | — | DRAFT |
| שמירה ומחיקה | `/data-retention` | — | DRAFT |

**חשוב:** `externalLegalReviewCompleted: false`  
**חשוב:** `externalAccessibilityCertificationCompleted: false`  
**חשוב:** `penetrationTestCompleted: false`

---

## 18. Security Headers

| Header | סטטוס | הערה |
|--------|--------|------|
| Content-Security-Policy | NOT IMPLEMENTED | נוצר בסשן זה |
| X-Frame-Options | NOT IMPLEMENTED | נוצר בסשן זה |
| X-Content-Type-Options | NOT IMPLEMENTED | נוצר בסשן זה |
| Strict-Transport-Security | NOT IMPLEMENTED | נוצר בסשן זה (prod only) |
| Referrer-Policy | NOT IMPLEMENTED | נוצר בסשן זה |
| Permissions-Policy | NOT IMPLEMENTED | נוצר בסשן זה |
| Cache-Control (sw.js) | ✅ | קיים ב-next.config.ts |

---

## 19. Rate Limiting

| Endpoint | מגבלה | מנגנון | מגבלה ידועה |
|----------|-------|--------|------------|
| login | 10 / 15min / IP | in-memory Map | per-Vercel-instance בלבד |
| upload | 30 / 10min / user | in-memory Map | per-instance |
| export | 5 / 5min / user | in-memory Map | per-instance |
| signed-url | 200 / 1min / user | in-memory Map | per-instance |

**⚠️ NOT IMPLEMENTED — Durable rate limiting:** in-memory בלבד = לא global. מתועד כידוע. שיפור לשלב עתידי.

---

## 20. Audit Log — Actions שמוגדרות

```
login, logout, worker.create, worker.update, worker.archive, worker.unarchive,
document.upload, document.delete, vehicle.create, vehicle.update, vehicle.archive,
heavy_equipment.create, heavy_equipment.update, heavy_equipment.archive,
lifting_equipment.create, lifting_equipment.update, lifting_equipment.archive,
subcontractor.create, subcontractor.update, subcontractor.archive,
safety_briefing.create, lifting_appointment.create, legal_consent.accept,
export.generate, admin.user_create, admin.user_update, admin.phone_add, admin.phone_remove
```

**Actions שנוספו בסשן זה:** ראה lib/audit/log.ts

---

## 21. Features — מצב יישום

### VERIFIED (פעיל ובדוק)
- Login (username/password)
- Session management (HMAC)
- Workers CRUD + archive
- Documents upload/view/delete
- Vehicles + licenses + insurances
- Heavy equipment + insurances
- Lifting equipment + appointments
- Subcontractors
- Safety briefings
- Height restrictions  
- Manager licenses
- Professional licenses
- Entity notes
- Legal consent flow
- Audit log (fire-and-forget)
- Rate limiting (in-memory)
- PWA / Offline banner
- Camera capture
- Drag & Drop upload
- PDF export (lifting appointments)
- Excel/PDF reports
- Weekly email (Cron)
- Admin users management
- Audit view page
- Archive/restore

### PARTIALLY VERIFIED
- Magic bytes validation on upload
- Orphan file cleanup
- site_feedback functionality
- professional_licenses RLS

### NOT IMPLEMENTED
- MFA
- Durable rate limiting (global)
- Export ZIP (נוצר בסשן זה)
- Health endpoints (נוצר בסשן זה)
- Security headers CSP (נוצר בסשן זה)
- CSRF validation (לא נדרש עם SameSite=Lax + JSON API)

### DEPRECATED
- `manager_insurances` table — לא בשימוש פעיל
- Phone-based auth — עדיין פעיל אך ירושה

---

## 22. הנחות ברירת מחדל שנקבעו בסשן זה

1. **גרסאות משפטיות:** שודרגו ל-1.0, effectiveDate = 2026-07-18
2. **effectiveJurisdiction:** ישראל — בית משפט מחוזי ב[עיר לפי ח.פ.] — ברירת מחדל שמרנית
3. **CSRF:** SameSite=Lax + JSON-only API = הגנה מספקת ל-MVP ללא header נפרד
4. **middleware.ts:** נשאר middleware.ts — Next.js 16 עדיין תומך בשם זה
5. **Magic bytes validation:** לא נוסף — הוגדר כ-SHOULD HAVE לשלב עתידי
6. **MFA:** לא מומש — ראה MFA_IMPLEMENTATION_STATUS_HE.md

---

*מסמך זה אינו מוצהר כמלא ומדויק ב-100%. הוא מבוסס על קריאת קוד ב-2026-07-18.*
