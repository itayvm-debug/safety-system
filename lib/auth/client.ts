/**
 * client.ts — קריאת role ב-Client Components מ-cookie לא-httpOnly
 */

export function getClientRole(): 'admin' | 'viewer' | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )safedoc_role=([^;]*)/);
  const val = match?.[1];
  if (val === 'admin' || val === 'viewer') return val;
  return null;
}

export function isAdmin(): boolean {
  return getClientRole() === 'admin';
}
