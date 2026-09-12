# International Data Transfer Assessment

**Version:** 1.0  
**Date:** 2026-09-12  
**Jurisdiction:** Israel (Protection of Privacy Law 5741-1981 and Regulations)  
**Scope:** All SafeDoc sub-processors that receive or process personal data outside Israel  

> **LEGAL REVIEW REQUIRED** — This document is an internal factual inventory. It does not constitute a legal opinion on the adequacy of transfer mechanisms under Israeli law. Qualified legal counsel must be engaged to confirm that all transfers are lawful.

---

## Section 1: Known Transfer Locations

| Provider | Service | Personal Data Transferred | Region | Transfer Mechanism | Status |
|----------|---------|--------------------------|--------|------------------|--------|
| **Supabase** (AWS ap-northeast-1) | Primary database + file storage | All personal data: worker PII (name, ID, phone, photo), professional licenses, safety documents, employee performance reviews, audit logs, authentication data | Japan — AWS Tokyo | DPA with Supabase | `[VERIFY: confirm DPA is signed and in force]` |
| **Vercel** | Application hosting, CDN, Edge Functions | Application code execution; HTTP request metadata (IP addresses, headers, cookies); no persistent personal data storage beyond request processing | Global CDN; serverless functions in nearest region to user | DPA with Vercel | `[DPA STATUS UNKNOWN — VERIFY AND OBTAIN]` |
| **Resend** | Transactional email delivery | Recipient email addresses; email body (worker names, document status summaries in weekly reports; pending review counts in reminders) | International (US-based service) | DPA with Resend | `[DPA STATUS UNKNOWN — VERIFY AND OBTAIN]` |
| **Anthropic** | AI/LLM API for document OCR | Worker ID document images (JPEG/PNG bytes) sent to `/v1/messages` endpoint; structured JSON returned; no explicit data retention commitment reviewed | United States | Data processing terms in Anthropic API agreement | `[DPA/TERMS STATUS UNKNOWN — VERIFY ANTHROPIC'S DATA PROCESSING TERMS APPLY]` |

---

## Section 2: Israeli Law Context

### Applicable Framework

The **Protection of Privacy Law, 5741-1981** and its subsidiary regulations (including the Protection of Privacy Regulations (Transfer of Data to Databases Outside of Israel), 5761-2001) govern cross-border data transfers.

Transfers of personal data outside Israel are generally permitted where one of the following applies:

| Basis | Applicability to SafeDoc |
|-------|-------------------------|
| **(a) Adequacy** — the destination country provides a level of protection equivalent to Israeli law | Japan and the United States do not have a general adequacy determination vis-à-vis Israeli law as of the audit date. **Requires legal confirmation.** |
| **(b) Consent** — the data subject has given informed consent to the transfer | Workers whose data is processed are employees of customer companies; their individual consent to international transfers may not have been obtained. Employer-mediated consent requires legal review. |
| **(c) Contractual safeguards** — a binding contract with the recipient ensures adequate protection | DPAs with sub-processors are intended to serve this function. **DPA status must be confirmed for all four sub-processors.** |
| **(d) Statutory exception** — e.g., transfer is necessary for contract performance | May apply to some processing but should not be relied upon as the primary basis. |

### Key Risk: Japan (AWS Tokyo / Supabase)

Israel does not have a published adequacy decision for Japan. The primary intended transfer mechanism is the contractual DPA with Supabase. If that DPA is not in force or does not meet the regulatory standard, the storage of all personal data in AWS Tokyo may lack a compliant legal basis under Israeli law.

### Key Risk: United States (Anthropic, Resend, Vercel)

Similarly, Israel does not have a general adequacy decision for the United States under the Protection of Privacy Law. DPAs or equivalent data processing agreements with US-based sub-processors are the intended transfer mechanism.

### Special Concern: Anthropic

Anthropic receives worker ID document images for OCR processing. These images are particularly sensitive (biometric/ID data). The scope of Anthropic's data retention, secondary use, and model training policies must be reviewed before relying on this sub-processor for sensitive documents. Anthropic's standard API terms should be reviewed to confirm they include adequate data processing commitments.

---

## Section 3: Missing Actions

| Action | Priority | Owner |
|--------|---------|-------|
| Verify and obtain/confirm signed DPA with **Supabase** | Critical | Legal / Management |
| Verify and obtain/confirm signed DPA with **Vercel** | High | Legal / Management |
| Verify and obtain/confirm signed DPA with **Resend** | High | Legal / Management |
| Review **Anthropic** API terms for data processing commitments; obtain DPA if available | High | Legal / Management |
| Update privacy policy (`/privacy`) v1.2 to add **Anthropic** to sub-processors list | High | Engineering |
| Obtain legal opinion on transfer adequacy to Japan and the US under Israeli law | High | Legal counsel |
| Disclose international transfer locations in customer DPA (DATA_PROCESSING_ADDENDUM) | Medium | Legal counsel |

---

## Section 4: Disclosure in Privacy Policy

The privacy policy (v1.1) currently lists:
- Supabase — ✓ listed
- Vercel — ✓ listed
- Resend — ✓ listed
- **Anthropic — NOT listed** (missing as of v1.1)

Update to v1.2 must include Anthropic with a description of the data transferred (worker ID document images for OCR) and the purpose (automated identity data extraction).
