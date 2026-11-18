/**
 * Two-factor policy (owner decision 2026-11-18):
 *  - mandatory for platform admins (profiles.role = 'admin'); optional for everyone else;
 *  - 14-day transition: until MFA_ENFORCE_FROM a banner asks admins to enrol, afterwards an admin
 *    without a verified factor can only reach the enrolment page;
 *  - a lost phone is handled by another platform admin resetting the factor (audited).
 */
export const MFA_ENFORCE_FROM = new Date('2026-12-02T00:00:00+02:00');

export const MFA_PENDING_COOKIE_NAME = 'safedoc_mfa_pending';
/** How long the password step stays valid while the user types the code. */
export const MFA_PENDING_MAX_AGE_SECONDS = 5 * 60;

/** Paths an admin who must still enrol can reach (plus the public ones). */
export const MFA_SETUP_ALLOWED_PATHS = ['/account/security', '/api/account/mfa', '/api/auth/logout', '/legal-consent', '/api/legal-consent'];

export function isMfaRequiredForRole(role: string | null | undefined): boolean {
  return role === 'admin';
}

export function isMfaEnforced(now = new Date()): boolean {
  return now.getTime() >= MFA_ENFORCE_FROM.getTime();
}

export function daysUntilEnforcement(now = new Date()): number {
  return Math.max(0, Math.ceil((MFA_ENFORCE_FROM.getTime() - now.getTime()) / 86_400_000));
}
