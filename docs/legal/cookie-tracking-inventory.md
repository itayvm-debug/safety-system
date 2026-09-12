# Cookie & Client-Side Storage Inventory

**Version:** 1.0  
**Date:** 2026-09-12  
**Audit Method:** Source code review (not live browser capture)  
**Scope:** SafeDoc B2B SaaS — all cookie and client storage mechanisms in the codebase  

> **Audit scope note:** This inventory was produced by static code review. A live browser capture may reveal additional cookies set by third-party scripts or CDN providers. No third-party scripts were identified in the codebase at time of audit.

---

## Summary

**No analytics, marketing, or third-party tracking found.**  
All cookies set by SafeDoc are strictly necessary for authentication and core service functionality, or functional (role-based UI behaviour). No consent banner is required for these categories under applicable B2B service law.

---

## Table 1 — Cookies Set by SafeDoc

| Name | Category | HttpOnly | Secure | SameSite | MaxAge | Purpose | First/Third Party |
|------|----------|----------|--------|----------|--------|---------|-------------------|
| `safedoc_session` | Strictly Necessary | **Yes** | Yes (production) | Lax | 7 days | Signed session token (HMAC-SHA256 payload); used for all authenticated requests | First |
| `safedoc_role` | Functional | **No** | Yes (production) | Lax | 7 days | Role string for client-side UI decisions (e.g., show/hide menu items). See note below. | First |
| `safedoc_consented` | Strictly Necessary | **Yes** | Yes (production) | Lax | 1 year | Records that the user has accepted the current Terms and Privacy Policy version | First |
| `safedoc_active_company` | Strictly Necessary | **Yes** | Yes (production) | Lax | session | Active company UUID for multi-company context switching | First |

### Notes on Table 1

- **Secure flag:** "Yes (production)" means the `Secure` attribute is set in the production environment. In local development (HTTP), it may not be set. Confirm via middleware configuration.
- **SameSite=Lax:** Appropriate for authentication cookies. Protects against CSRF in most scenarios while allowing top-level navigations.
- **No `HttpOnly` on `safedoc_role`:** See dedicated section below.

---

## Table 2 — `localStorage` Usage

| Key Pattern | Purpose | Contains PII? | Cleared on Logout? |
|-------------|---------|---------------|--------------------|
| `safedoc_dismissed_alerts_*` | Stores IDs of alerts the user has dismissed, to suppress re-display | No — alert IDs only | No (browser-local preference; no PII risk) |
| `offline_cache_*` | Dashboard data for offline use | Possibly — may include worker counts or document status aggregates | No |

### Notes on Table 2

- `offline_cache_*` entries may contain aggregate data that could indirectly identify individuals (e.g., worker counts per company). This is low risk but should be considered if offline caching scope expands.
- Neither pattern stores personal identification data (names, ID numbers, phone numbers).

---

## Not Present in Codebase

The following tracking and analytics technologies were searched for and **not found**:

| Technology | Searched For | Found? |
|-----------|-------------|--------|
| Google Analytics / gtag | `gtag`, `G-`, `UA-`, `google-analytics` | No |
| Meta Pixel / Facebook | `fbq`, `facebook-pixel`, `connect.facebook.net` | No |
| Hotjar | `hotjar`, `hj(` | No |
| Sentry | `@sentry/`, `Sentry.init` | No |
| Intercom | `intercom`, `Intercom(` | No |
| Mixpanel | `mixpanel` | No |
| `sessionStorage` (meaningful PII use) | Session storage with user data | No |
| `IndexedDB` | IndexedDB usage | No |

---

## Cookie Consent Requirement Assessment

**Applicable context:** B2B SaaS; access only by authenticated invited users; Israeli jurisdiction; no EU data subjects.

**Assessment:**

All cookies set by SafeDoc fall into two categories:
1. **Strictly necessary** — required for the authenticated service to function (session, consent record, active company). These cannot be meaningfully declined by the user while using the service.
2. **Functional** — support a specific feature (role-based UI) that is part of the contracted service.

Under a B2B service model where users access the platform as employees or contractors of a business customer, and where all cookies are necessary for service operation:

- No cookie consent banner is legally required for the current cookie set.
- The cookie description embedded in the privacy policy is appropriate and sufficient.

**Future-proofing:** If analytics, behavioural tracking, or advertising cookies are added at any point, a full consent architecture (opt-in banner, consent storage, conditional script loading) must be designed and deployed **before** those cookies are set.

---

## Note on `safedoc_role` (Non-HttpOnly Cookie)

While the `safedoc_role` cookie does not grant authentication privileges (the session token is used for that), it is readable by any JavaScript executing on the SafeDoc pages. Implications:

- An XSS vulnerability in the application could read the user's role from this cookie.
- The role string itself is not a secret, but it provides an attacker with reconnaissance information.

**Recommendation:** Evaluate whether client-side role access is required. If the role can be derived from an API call on page load (e.g., from the session validation endpoint), consider removing this cookie and storing role in the server-side session token only (`safedoc_session`). This would eliminate the non-HttpOnly surface without breaking UI behaviour.

**Current risk classification:** Low. Not a priority blocker for launch but recommended as a medium-term improvement.

---

## Audit Performed By

Internal code review, 2026-09-12. Next review recommended when new third-party scripts or cookies are introduced.
