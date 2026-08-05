import { cookies } from 'next/headers';

export const ACTIVE_COMPANY_COOKIE_NAME = 'safedoc_active_company';
export const ACTIVE_COMPANY_MAX_AGE = 60 * 60 * 24 * 7; // 7 ימים

/** קריאת UUID החברה הפעילה מ-cookie httpOnly. מחזיר null אם לא מוגדר. */
export async function getActiveCompanyId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(ACTIVE_COMPANY_COOKIE_NAME)?.value;
  // UUID validation — reject malformed values
  if (!value || !/^[0-9a-f-]{36}$/.test(value)) return null;
  return value;
}
