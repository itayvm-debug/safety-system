/**
 * Two-factor policy.
 *  - Owner decision 2026-11-18 (later the same day): two-factor is OPTIONAL for everyone.
 *    No role must enrol, no banner, no deadline. Anyone may enable it at /account/security;
 *    whoever enabled it is always asked for a code at sign-in.
 *  - A lost phone is handled by another platform admin resetting the factor (audited).
 *  - To make it mandatory again: list the roles in MFA_REQUIRED_ROLES and set MFA_ENFORCE_FROM
 *    (admins then see a banner until that date and are limited to the enrolment page after it).
 */
export const MFA_REQUIRED_ROLES: readonly string[] = [];
export const MFA_ENFORCE_FROM = new Date('2026-12-02T00:00:00+02:00');

export const MFA_PENDING_COOKIE_NAME = 'safedoc_mfa_pending';
/** How long the password step stays valid while the user types the code. */
export const MFA_PENDING_MAX_AGE_SECONDS = 5 * 60;

/** Paths an admin who must still enrol can reach (plus the public ones). */
export const MFA_SETUP_ALLOWED_PATHS = ['/account/security', '/api/account/mfa', '/api/auth/logout', '/legal-consent', '/api/legal-consent'];

export function isMfaRequiredForRole(role: string | null | undefined, requiredRoles: readonly string[] = MFA_REQUIRED_ROLES): boolean {
  return !!role && requiredRoles.includes(role);
}

export function isMfaEnforced(now = new Date()): boolean {
  return now.getTime() >= MFA_ENFORCE_FROM.getTime();
}

export function daysUntilEnforcement(now = new Date()): number {
  return Math.max(0, Math.ceil((MFA_ENFORCE_FROM.getTime() - now.getTime()) / 86_400_000));
}
