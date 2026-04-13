/**
 * נרמול מספר טלפון ישראלי לפורמט E.164: +972XXXXXXXXX
 * תומך בקלט: 0538000993 / 053-800-0993 / +972538000993 / 972538000993
 */
export function normalizeIsraeliPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');

  if (digits.startsWith('972')) return `+${digits}`;
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`;
  return `+972${digits}`;
}

/**
 * מחזיר רשימת פורמטים אפשריים לאותו מספר,
 * לצורך תמיכה בנתונים ישנים במסד שנשמרו בפורמט מקומי.
 */
export function phoneVariants(raw: string): string[] {
  const e164 = normalizeIsraeliPhone(raw);
  const local = '0' + e164.replace(/^\+972/, '');
  return Array.from(new Set([e164, local]));
}
