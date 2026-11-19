/**
 * Deterministic normalization for worker identity values.
 *
 * Rule: trim whitespace, return null for empty/missing values.
 * No further transformation is applied (no case change, no hyphen removal,
 * no check-digit validation) — the business currently accepts values as entered.
 *
 * All duplicate checks and unique indexes use these normalized values.
 * Both national_id and passport_number share the same normalization rule.
 */
export function normalizeIdentityValue(value: unknown): string | null {
  // Only strings count. A JSON number would lose leading zeros (012345678 → 12345678) and slip
  // past the duplicate check (code review 2026-11-19); a non-string is treated as missing → 400.
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}
