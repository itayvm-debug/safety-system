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
export function normalizeIdentityValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}
