export const SYSTEM_VERSION = '1.0.0';

/**
 * SCHEMA_VERSION reflects which DB migrations are expected to have run.
 *
 * Current baseline (Production):
 *   migration_session1_legal_security.sql    → legal_acceptances, audit_logs
 *   migration_legal_acceptances_dedup_and_unique.sql → privacy_version, unique index
 *
 * Pending (NOT yet run in Production):
 *   migrations/phase2_fixes.sql            → entity_notes, is_archived columns
 *   migrations/durable-rate-limiting.sql   → rate_limit_events, rate_limit_check()
 *
 * Increment this when a new migration is applied to Production.
 */
export const SCHEMA_VERSION = '1.0.2-pending-phase2';

/** Build date — set by Vercel at build time via NEXT_PUBLIC_BUILD_DATE env var */
export const BUILD_DATE: string = process.env.NEXT_PUBLIC_BUILD_DATE ?? 'לא הוגדר';
