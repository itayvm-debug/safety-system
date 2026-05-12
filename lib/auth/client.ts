/**
 * client.ts — קריאת role ב-Client Components מ-cookie לא-httpOnly
 */

export function getClientRole(): 'admin' | 'user' | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )safedoc_role=([^;]*)/);
  const val = match?.[1];
  if (val === 'admin') return 'admin';
  // 'user' + 'viewer' (תאימות לאחור — session ישן)
  if (val === 'user' || val === 'viewer') return 'user';
  return null;
}

export function isAdmin(): boolean {
  return getClientRole() === 'admin';
}
