/**
 * config.ts — קבועים משפטיים מרכזיים
 * גרסת המסמכים שודרגה ל-1.1 בסשן Legal Identity Correction, 2026-07-22
 */

import { PLATFORM_OPERATOR } from '@/config/operator';

export const LEGAL = {
  // ── זיהוי המפעיל ─────────────────────────────────────────────────
  companyName:         PLATFORM_OPERATOR.operatorName,
  companyPhone:        PLATFORM_OPERATOR.operatorPhone,
  companyEmail:        PLATFORM_OPERATOR.operatorEmail,
  privacyContactEmail: PLATFORM_OPERATOR.privacyContactEmail,
  dpoName:             '',

  // ── שם מוצר ─────────────────────────────────────────────────────
  productName: 'SafeDoc',
  productUrl:  process.env.NEXT_PUBLIC_APP_URL ?? 'https://safety-system-henna.vercel.app',

  // ── תאריכים ─────────────────────────────────────────────────────
  /** תאריך תחולה של גרסת המסמכים הנוכחית */
  termsEffectiveDate: '2026-07-22',

  // ── גרסאות מסמכים — יש לעדכן בכל שינוי מהותי ─────────────────
  /** גרסת תנאי שימוש — שינוי דורש אישור מחדש מהמשתמשים */
  termsVersion:        '1.1',
  /** גרסת מדיניות פרטיות — שינוי דורש אישור מחדש מהמשתמשים */
  privacyVersion:      '1.1',
  /** גרסת הצהרת נגישות — שינוי אינו דורש אישור מחדש */
  accessibilityVersion: '1.1',

  // ── retention defaults (ניתן להתאמה לפי לקוח והסכם) ─────────────
  retentionWorkerDataYears:    7,
  retentionDocumentFilesYears: 7,
  retentionAuditLogsYears:     5,
  retentionSessionDays:        7,

  // ── sub-processors ───────────────────────────────────────────────
  subprocessors: [
    {
      name:    'Supabase, Inc.',
      country: 'יפן — AWS Tokyo (ap-northeast-1)',
      purpose: 'בסיס נתונים, אחסון קבצים ואימות משתמשים',
      dpUrl:   'https://supabase.com/privacy',
    },
    {
      name:    'Vercel, Inc.',
      country: 'תשתית גלובלית של Vercel',
      purpose: 'אירוח האפליקציה, פונקציות שרת ותשתית ההפעלה',
      dpUrl:   'https://vercel.com/legal/privacy-policy',
    },
    {
      name:    'Resend, Inc.',
      country: 'עיבוד בינלאומי בהתאם לתנאי השירות',
      purpose: 'שליחת הודעות ודוחות מערכת בדואר אלקטרוני',
      dpUrl:   'https://resend.com/legal/privacy-policy',
    },
  ],

  // ── WCAG / accessibility ─────────────────────────────────────────
  accessibilityLastAudit:    '2026-07-22 (בדיקה פנימית)',
  accessibilityLevel:        'בתהליך — טרם הוצהרה עמידה רשמית בתקן',
  accessibilityContactEmail: PLATFORM_OPERATOR.accessibilityContactEmail,

  // ── internal flags (NOT FOR PUBLIC DISPLAY) ──────────────────────
  legallyReviewed:                             false,
  externalLegalReviewCompleted:                false,
  externalAccessibilityCertificationCompleted: false,
  penetrationTestCompleted:                    false,
} as const;

export type SubProcessor = typeof LEGAL.subprocessors[number];
