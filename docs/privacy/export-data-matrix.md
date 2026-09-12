# Export & Report Data Matrix

**Version:** 1.0  
**Date:** 2026-09-12  
**Scope:** All data export and report mechanisms in SafeDoc  
**Method:** Source code review of API routes, cron jobs, and client-side PDF generation  

---

## Export & Report Summary

| Export / Report | Triggered By | Role Required | Data Included | Includes Review Data? | Delivery |
|----------------|-------------|--------------|--------------|----------------------|---------|
| **Admin ZIP export** | Manual, via admin UI | Platform admin | workers, professional_licenses, manager_licenses, safety_briefings, height_restrictions, documents, company_members, manager_user_mappings, worker_review_assignments, worker_weekly_reviews, worker_transfer_audit, review_reminder_log, entity_notes, vehicles, vehicle_licenses, vehicle_insurances, heavy_equipment, heavy_equipment_insurances, lifting_equipment, lifting_machine_appointments, subcontractors, alerts, audit_logs, legal_acceptances, profiles — all scoped to company_id | **YES — `worker_weekly_reviews` included with all fields** | Download (.zip) |
| **Weekly safety status report** | Cron job (Sunday 07:00 UTC) | N/A — system-initiated | Worker names, document statuses, expiry dates per company; sent to `report_email` addresses in `profiles` table | NO | Email via Resend |
| **Review reminder email** | Cron job (Thursday 06:00 UTC) | N/A — system-initiated | Company name, count of pending reviews, week start date | NO — no individual worker names or ratings | Email via Resend |
| **Reviews report API** | On-demand request | Company owner or admin (`owner`, `admin`) | Worker names, ratings in 6 dimensions (1–10), manager comments (free text), evaluator manager name, week_start — scoped to company_id | **YES — full detail** | API response (JSON) |
| **Lifting machine appointment PDF** | On-demand | Company member (`member` or above) | Appointer name, appointer signature (image), appointer license number/expiry, machine details, company name, appointment date | NO | Server-generated PDF; download via signed URL (1-hour expiry) |
| **Worker detail PDF (client-side)** | On-demand | Company member | Worker name, ID number, photos, document list, license status | NO | PDF generated in browser; direct download |
| **Excel export** (if implemented) | On-demand | Company member | Worker list, document statuses, expiry dates | NO | Download (.xlsx) |

---

## Privacy Findings

### 1. Admin ZIP Export Includes Performance Reviews
The admin ZIP export includes `worker_weekly_reviews` (scores, manager comments, evaluator ID). This is **intentional** for data portability purposes — a customer leaving SafeDoc should be able to take their data. However:
- This should be **explicitly noted in the DPA** with customers, so they understand what the export contains.
- The export is restricted to platform admin only — no customer-facing export of review data.
- Recommendation: Add a UI warning on the export button: "Export includes employee performance review data."

### 2. Weekly Safety Report Emails Worker Names
The weekly cron sends worker names and document status to the `report_email` address stored in `profiles`. These email addresses are company-provided (typically a safety officer or manager).
- SafeDoc is acting as a data processor, not controller, for this communication.
- The DPA with customers should clarify that the company is responsible for ensuring these addresses are authorised to receive this information.
- No list of worker names is sent to any external marketing or analytics platform.

### 3. Review Report API — No Cross-Company Leakage
The reviews report API filters by `company_id` derived from the authenticated session. Independent code review confirmed no cross-company data leakage.

### 4. Lifting Machine PDFs Contain Signatures
Lifting machine appointment PDFs include a digitally-captured signature image. PDFs are generated server-side and delivered via Supabase signed URLs with a 1-hour expiry. After expiry, the URL is invalid. The underlying file remains in Supabase Storage and is subject to the company's data retention policy.

### 5. Cron Emails — No Individual Review Data
Both cron-triggered emails (Sunday report and Thursday reminder) were verified to **not** include individual employee ratings or manager comments. The Thursday reminder email contains only an aggregate count of pending reviews.

---

## Data Flow Diagram (Summary)

```
Worker PII (name, ID, phone, photo)
  ├── Stored in: Supabase DB + Storage (AWS Tokyo)
  ├── Accessible via: authenticated UI (member+)
  ├── Exported via: Admin ZIP (platform admin only)
  └── In weekly email: name + doc status only

Review Data (scores, comments)
  ├── Stored in: Supabase DB (worker_weekly_reviews)
  ├── Accessible via: Reviews report API (owner/admin)
  ├── Exported via: Admin ZIP (included)
  └── NOT in: weekly emails, WhatsApp templates, worker PDFs
```
