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
  // A JSON number (e.g. 123456789) is kept as its digits; any other non-string is "missing".
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}
