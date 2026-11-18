/**
 * fields.ts — small server-side checks for free-text fields sent by the client.
 *
 * Found in the live QA round (2026-11-18): a subcontractor was saved with the phone "abc",
 * and a non-string value (e.g. a number) in name/phone/notes crashed the route with a 500.
 */

export type FieldResult = { ok: true; value: string | null } | { ok: false; error: string };

/** Optional text: string or empty → trimmed string / null. Anything else is refused. */
export function optionalText(value: unknown, label: string, max = 500): FieldResult {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: `ערך לא תקין בשדה ${label}` };
  const trimmed = value.trim();
  if (trimmed.length > max) return { ok: false, error: `${label} ארוך מדי (עד ${max} תווים)` };
  return { ok: true, value: trimmed || null };
}

const PHONE_CHARS = /^[0-9+\-\s().]+$/;

/**
 * Optional phone. Lenient on format (spaces, dashes, +, parentheses) but must hold 7–15 digits.
 * `existing` = the value already stored: an unchanged legacy value is always accepted,
 * so editing an old record never gets stuck on a phone saved before this check.
 */
export function optionalPhone(value: unknown, existing?: string | null): FieldResult {
  const text = optionalText(value, 'טלפון', 30);
  if (!text.ok || text.value === null) return text.ok ? text : { ok: false, error: 'מספר טלפון לא תקין' };
  if (existing != null && text.value === existing.trim()) return text;
  const digits = text.value.replace(/\D/g, '').length;
  if (!PHONE_CHARS.test(text.value) || digits < 7 || digits > 15) {
    return { ok: false, error: 'מספר טלפון לא תקין' };
  }
  return text;
}
