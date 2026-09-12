# Rate Limiting Review

**Version:** 1.0  
**Date:** 2026-09-12  
**Scope:** All API routes in SafeDoc  
**Method:** Source code review of route handlers and `lib/rate-limit/`  

---

## Section 1: Current Rate Limit Coverage

| Endpoint | Rate Limit | Limit Type | Key | Notes |
|----------|-----------|-----------|-----|-------|
| `POST /api/auth/login` | 10 requests / 15 min | Durable DB (`rate_limit_events`) | per IP | **Fail-open if DB unavailable** — see Section 3 |
| `POST /api/upload` | 30 requests / 10 min | Durable DB | per user | |
| `GET /api/admin/export` | 5 requests / 5 min | Durable DB | per user | |
| `GET /api/signed-url` | 200 requests / 60 sec | Durable DB | per user | High limit for presigned URL generation |
| All other endpoints | **None** | — | — | See gaps below |

---

## Section 2: Rate Limiting Gaps

The following endpoints are authenticated (require valid session) but have no rate limiting beyond authentication:

| Endpoint Pattern | Risk Level | Reason | Recommended Limit |
|-----------------|-----------|--------|------------------|
| `POST /api/ai/extract-worker-identity` | **High — P1** | Calls Anthropic API (external cost); processes ID document images; data exfiltration risk if abused | 10 requests/hour per user; 50 requests/day per company |
| `GET /api/reviews/report` | Medium — P2 | Data-heavy aggregation endpoint; can expose bulk review data | 20 requests/hour per user |
| `POST /api/reviews` (submit review) | Low — P3 | Requires auth + valid manager assignment; unique constraint limits duplicates | 50 requests/hour per user |
| `PATCH/DELETE /api/workers/:id` | Low — P3 | Authenticated CRUD; delete is destructive | 100 requests/hour per user |
| `PATCH/DELETE /api/vehicles/:id` | Low — P3 | Same as workers | 100 requests/hour per user |
| `PATCH/DELETE /api/equipment/:id` | Low — P3 | Same as workers | 100 requests/hour per user |
| `POST /api/legal-consent` | Low | Consent submission; not a data leak but replay risk | 10 requests/hour per user |
| `GET /api/admin/system-health` | Low | Admin-only health check; low risk | 30 requests/min per IP |

---

## Section 3: Fail-open Risk on Login Endpoint

**Risk Classification: P2**

The durable rate limiter (`lib/rate-limit/db.ts`) queries the `rate_limit_events` table in Postgres. If the database is unavailable (network partition, Supabase outage, connection exhaustion), the rate limiter function throws or returns an error.

**Current behaviour:** The login route catches the rate limit error and **fails open** — the request proceeds without rate limiting.

**Implication:** During a database outage, the login endpoint has no brute-force protection. An attacker who times an attack during a known outage window (or causes one) would bypass login rate limiting entirely.

**Options:**

| Option | Trade-off |
|--------|-----------|
| **Fail-closed for login** — return HTTP 503 if rate limiter errors | Most secure; users cannot log in during DB outage (may be acceptable since other features also fail) |
| **In-memory fallback counter** — use a local counter if DB is unavailable | More available; not durable across multiple instances / restarts; acceptable for Vercel serverless |
| **Accept and document** — document risk, monitor for outage + unusual login volume | Lowest effort; appropriate only if outage probability is very low and login volume monitoring is in place |

**Recommendation:** Implement fail-closed behaviour specifically for the login endpoint, or implement a lightweight in-memory fallback. Document the chosen approach in the security policy.

---

## Section 4: Recommendation Priority

| Priority | Action | Estimated Effort |
|----------|--------|-----------------|
| **P1** | Add rate limiting to `POST /api/ai/extract-worker-identity` — AI API cost + data risk | Small (reuse existing `applyRateLimit` pattern) |
| **P2** | Address fail-open behaviour on login rate limiter | Small-Medium (choose strategy, implement, test) |
| **P2** | Add rate limiting to `GET /api/reviews/report` | Small |
| **P3** | Add general CRUD rate limiting (workers, vehicles, equipment, reviews) | Medium (apply to multiple routes) |
| **P3** | Add rate limiting to `POST /api/legal-consent` and `GET /api/admin/system-health` | Small |

---

## Section 5: Implementation Notes

The existing rate limit pattern in `lib/rate-limit/db.ts` is reusable. New limits should follow the same pattern:

```typescript
await applyRateLimit(request, {
  key: `ai_extract:${userId}`,
  limit: 10,
  window: 3600, // 1 hour in seconds
});
```

Company-level limits (e.g., 50/day per company) require a separate key: `ai_extract_company:${companyId}`.

Consider externalising rate limit configuration to `config/rate-limits.ts` so limits can be adjusted without modifying route code.
