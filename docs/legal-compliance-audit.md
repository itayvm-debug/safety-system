# Legal & Compliance Audit — SafeDoc

**Audit Type:** Internal code and documentation review  
**Date:** 2026-09-12  
**Scope:** SafeDoc B2B SaaS — Israeli construction safety management  
**Jurisdiction:** Israel (Protection of Privacy Law 5741-1981 and regulations)  
**Auditor:** Internal engineering + AI-assisted review  

> **This document is an internal audit record. It does not constitute legal advice and does not certify compliance.**

---

## Compliance Audit Table

| # | Topic | Current State | Risk Level | Recommendation | Status |
|---|-------|--------------|-----------|----------------|--------|
| 1 | Privacy Policy | Exists at `/privacy`, v1.1; covers data categories, sub-processors, retention, and data subject rights. Anthropic missing from sub-processors list. | Medium | Add Anthropic as sub-processor. Bump to v1.2 and trigger re-consent. | PARTIAL |
| 2 | Terms of Use | Exists at `/terms`, v1.1; two `[DECISION NEEDED]` placeholders: SLA/availability guarantee and liability cap. | Medium | Management + legal counsel to fill SLA and liability cap before commercial launch. | PARTIAL |
| 3 | Cookie Policy | Embedded in privacy policy; no standalone cookie page. Only auth/functional cookies found (no analytics or marketing). | Low | Standalone page not legally required given cookie types; embedded policy is acceptable for B2B. Add note that future analytics cookies will require consent architecture. | PARTIAL |
| 4 | Accessibility Statement | Interim statement exists; no professional WCAG audit completed. | Medium | Commission professional accessibility audit before publishing a formal compliance statement. | PARTIAL |
| 5 | Data Subject Rights Procedure | Exists in `docs/DATA_SUBJECT_REQUEST_PROCEDURE_HE.md`; covers access, correction, deletion, portability. | Low | Review and confirm procedure aligns with final legal entity details once available. | PASS |
| 6 | Database Definition Document | Exists in `docs/DATABASE_DEFINITION_DOCUMENT_HE.md`. | Low | Keep updated as schema evolves. | PASS |
| 7 | Database Registration Assessment | Exists in `docs/DATABASE_REGISTRATION_ASSESSMENT_HE.md`; concludes registration may be required depending on business turnover. | Medium | Obtain management input on annual turnover; obtain legal opinion; register if required. | LEGAL REVIEW REQUIRED |
| 8 | DPA / Data Processing Agreement | Draft exists in `docs/DATA_PROCESSING_ADDENDUM_DRAFT_HE.md`; contains placeholders and has not been legally reviewed. | High | Legal review before any customer signs the DPA. | PARTIAL |
| 9 | Employee Privacy Notice Template | Exists in `docs/EMPLOYEE_PRIVACY_NOTICE_TEMPLATE_HE.md`; template for customer companies to issue to their workers. | Low | Customers must be instructed to issue this notice (or equivalent) to their workers. | PASS |
| 10 | Incident Response Plan | Exists in `docs/INCIDENT_RESPONSE_PROCEDURE_HE.md`; covers detection, containment, notification. | Low | Ensure contact details (legal entity, security email) are filled in when entity details are established. | PASS |
| 11 | Information Security Procedure | Exists in `docs/INFORMATION_SECURITY_POLICY_HE.md`. | Low | Annual review cycle recommended. | PASS |
| 12 | Data Retention Policy | Exists in `docs/DATA_RETENTION_REGISTER_HE.md`; several periods marked `[LEGAL REVIEW REQUIRED]`. | Medium | Legal review of retention periods for ID documents, safety records, and employment-related data. | PARTIAL |
| 13 | SVG Upload XSS | **WAS:** logo upload accepted SVG files served inline without sanitization — stored XSS risk. **FIXED** in this session: SVG MIME type blocked at upload validation. | ~~Critical~~ → Low | Verify sanitization also applies to any future image upload endpoints. Monitor for regression. | PASS (fixed) |
| 14 | Committed Credentials | `סיסמא לאתר.txt` contains admin password, viewer password, and `SESSION_SECRET` committed to the git repository. Credentials are live/usable. | **CRITICAL** | **SEE IMMEDIATE ACTIONS REQUIRED BELOW.** Rotate all credentials immediately. Consider `git filter-repo` to remove from history after legal/security counsel consultation. | MISSING |
| 15 | PII in Server Logs | **WAS:** phone numbers logged in plain text in auth routes. **FIXED** in this session: phone numbers masked in log output. | ~~High~~ → Low | Audit all other log statements for PII. Add log-scrubbing rule to security policy. | PASS (fixed) |
| 16 | Sub-processor Anthropic/AI | Anthropic API used in `/api/ai/extract-worker-identity` for ID document OCR; worker ID image bytes sent externally. Anthropic is **not listed** in the privacy policy sub-processors section. | High | Update privacy policy to add Anthropic. Confirm Anthropic DPA or data processing terms apply. | MISSING |
| 17 | Fail-open Rate Limiting | The durable rate limiter (`lib/rate-limit/db.ts`) fails **open** if Postgres is unavailable — all rate limits including login bypass when DB is down. | High (P2) | Evaluate fail-closed mode specifically for the login endpoint. Document risk acceptance if fail-open is retained. | PARTIAL |
| 18 | No Rate Limiting on CRUD Routes | Worker, vehicle, equipment, and review CRUD endpoints have no rate limiting. Authentication is required, limiting risk. | Medium (P3) | Add rate limits; see `docs/security/rate-limit-review.md`. Priority: AI endpoint (P1), report endpoint (P2), general CRUD (P3). | PARTIAL |
| 19 | `safedoc_role` Cookie (non-HttpOnly) | `safedoc_role` cookie is readable by client-side JavaScript (not HttpOnly). Role string exposed to page scripts. Not a direct authentication bypass but increases attack surface. | Low-Medium | Consider moving role to server-side session only and removing the client-readable cookie if UI can derive role from session API. | PARTIAL |
| 20 | Employee Review Privacy | Review data scoped per `company_id` and `evaluator_manager_id` server-side; unique constraint per week/worker enforced at DB level. Manager comment field has no UI guidance. | Low | Add UI reminder next to manager comment field: professional observations only. See `docs/employee-review-privacy-controls.md`. | PARTIAL |
| 21 | Export Authorization | Admin ZIP export properly scoped to `company_id`; reviews included intentionally for data portability. Reviews report API is admin/owner only, company-scoped. | Low | Note review inclusion in DPA with customers. See `docs/privacy/export-data-matrix.md`. | PASS |
| 22 | Weekly Report Endpoint | `/api/reports/weekly` authenticated by `cron-secret` header only; not covered by the main auth middleware. | Medium | Document this intentional design; ensure `CRON_SECRET` is rotated regularly and not committed to version control. Verify endpoint is not reachable without the secret. | PARTIAL |
| 23 | Legal Acceptance Versioning | `legal_acceptances` table tracks consent version, timestamp, user ID, and IP address. `CURRENT_CONSENT_VERSION` defined in `config/legal.ts` and `lib/auth/session.ts`. | Low | Ensure version is bumped and re-consent triggered whenever policy material terms change. See `docs/legal/legal-changelog.md`. | PASS |
| 24 | Legal Operator Identity | `[LEGAL ENTITY NAME REQUIRED]` and related placeholders remain in privacy policy, terms of use, and DPA. | High | Management must provide legal entity name, registered address, and contact email before commercial launch. See `docs/legal/missing-business-inputs.md`. | MISSING |
| 25 | DPO Assessment | Completed in `docs/DPO_APPLICABILITY_ASSESSMENT_HE.md`; concludes DPO likely not required for current scale but recommends legal confirmation. | Low | Obtain formal legal opinion confirming DPO non-requirement. Reassess if processing scale increases significantly. | LEGAL REVIEW REQUIRED |
| 26 | Accessibility (technical) | Automated `axe-core` tests via Playwright exist; no professional WCAG 2.1 AA audit completed. | Medium | Commission professional audit before publishing compliance claim. See `docs/legal/accessibility-applicability.md`. | PARTIAL |
| 27 | IP / Open Source | Audit exists in `docs/IP_AND_LICENSE_RELEASE_AUDIT_HE.md` and `docs/legal/open-source-license-audit.md`. No GPL/AGPL/SSPL found in production. `xlsx` 0.18.5 license needs verification. | Low | Verify `xlsx` 0.18.5 remains Apache-2.0; re-audit on any dependency upgrade. | PARTIAL |
| 28 | International Data Transfers | All data stored in AWS Tokyo (Supabase); Vercel CDN is global; Resend and Anthropic are US-based. No adequacy determination between Israel and Japan or Israel and US is known. DPA status with sub-processors not fully confirmed. | High | Legal review of transfer mechanism adequacy. Confirm and obtain signed DPAs with all four sub-processors. See `docs/privacy/international-transfer-assessment.md`. | LEGAL REVIEW REQUIRED |
| 29 | Consumer Law | No consumer checkout, registration, or e-commerce flow found. Product is B2B only; access is by invitation. | Low | No action required at present. If a self-serve consumer tier is added, consumer protection law assessment required. | PASS |
| 30 | Marketing Email | No marketing or promotional email found in codebase. All emails are transactional (weekly safety report, review reminders). | Low | No consent banner or unsubscribe mechanism needed for transactional emails. Confirm this categorisation holds if email content changes. | PASS |
| 31 | `security.txt` | No `/.well-known/security.txt` file found. | Low | Add `security.txt` with responsible disclosure contact before public launch. | MISSING |
| 32 | Penetration Test | Not completed (`LEGAL.penetrationTestCompleted = false` in config). | High | Schedule penetration test before commercial launch or first enterprise customer. | MISSING |
| 33 | MFA | MFA is not enforced. Any role (including admin and owner) can access the platform with password only. | Medium | Enforce or strongly recommend MFA for `admin` and `owner` roles. Consider mandatory MFA as a roadmap item. | PARTIAL |
| 34 | Privacy by Design Checklist | Exists in `docs/PRIVACY_IMPACT_ASSESSMENT_HE.md`. | Low | Review and update when new features involving personal data are added. | PASS |
| 35 | Business Continuity Plan | No business continuity plan found prior to this audit session. | Medium | See newly created `docs/security/business-continuity-plan.md`. RTO/RPO targets still require management input. | PARTIAL |

---

## IMMEDIATE ACTIONS REQUIRED (do not push to production until resolved)

> The following items represent critical security issues that must be resolved before any customer deployment.

### 1. Rotate All Committed Credentials — CRITICAL

The file `סיסמא לאתר.txt` (committed to the git repository) contains the following live credentials:

- **Admin password:** `[REDACTED — see סיסמא לאתר.txt]`
- **Viewer password:** `[REDACTED — see סיסמא לאתר.txt]`
- **SESSION_SECRET:** `[REDACTED — see סיסמא לאתר.txt]`

**Required actions:**
1. **Immediately** change the admin and viewer passwords in Supabase Auth / the production environment.
2. **Immediately** rotate `SESSION_SECRET` in the production environment secret manager. All active sessions will be invalidated (this is by design and expected).
3. Remove `סיסמא לאתר.txt` from the repository. After removal, consider running `git filter-repo` to purge the file from git history — consult legal and security counsel before rewriting published history, as it affects all collaborators.
4. Audit whether these credentials were ever exposed in CI/CD logs, pull request diffs, or any external service.

### 2. Add Anthropic to Privacy Policy Sub-Processors

Update `/privacy` (v1.1 → v1.2) to list Anthropic as a sub-processor for AI-assisted document OCR. Bump `CURRENT_CONSENT_VERSION` in `config/legal.ts` and `lib/auth/session.ts` to trigger re-consent from existing users.

### 3. Legal Review of DPA Before Customer Signing

The DPA draft (`docs/DATA_PROCESSING_ADDENDUM_DRAFT_HE.md`) must be reviewed by qualified legal counsel admitted in Israel before any customer executes it. Do not present the draft as a binding document.

### 4. Professional Accessibility Audit Before Compliance Claim

Do not publish or represent that SafeDoc is WCAG 2.1 AA compliant until a professional accessibility audit has been completed. The current automated `axe-core` coverage is a necessary but not sufficient basis for a compliance claim.
