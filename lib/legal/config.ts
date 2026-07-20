/**
 * config.ts — קבועים משפטיים מרכזיים
 * גרסת המסמכים שודרגה ל-1.0 בסשן Final Consolidated Production-Readiness, 2026-07-18
 */

import { PLATFORM_OPERATOR } from '@/config/operator';

export const LEGAL = {
  // ── זיהוי החברה ─────────────────────────────────────────────────
  companyName:          PLATFORM_OPERATOR.name,
  companyNameEn:        PLATFORM_OPERATOR.nameEn,
  companyRegistration:  PLATFORM_OPERATOR.registration,
  companyAddress:       PLATFORM_OPERATOR.address,
  companyPhone:         PLATFORM_OPERATOR.phone,
  companyEmail:         PLATFORM_OPERATOR.email,
  privacyContactEmail:  PLATFORM_OPERATOR.privacyEmail,
  dpoName:               '',

  // ── שם מוצר ─────────────────────────────────────────────────────
  productName:   'SafeDoc',
  productUrl:    process.env.NEXT_PUBLIC_APP_URL ?? 'https://safety-system-henna.vercel.app',

  // ── תאריכים ─────────────────────────────────────────────────────
  /** תאריך תחולה של גרסת המסמכים הנוכחית */
  termsEffectiveDate: '2026-07-18',

  // ── גרסאות מסמכים — יש לעדכן בכל שינוי מהותי ─────────────────
  /** גרסת תנאי שימוש — שינוי דורש אישור מחדש מהמשתמשים */
  termsVersion:        '1.0',
  /** גרסת מדיניות פרטיות — שינוי דורש אישור מחדש מהמשתמשים */
  privacyVersion:      '1.0',
  /** גרסת הצהרת נגישות — שינוי אינו דורש אישור מחדש */
  accessibilityVersion: '1.0',

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
  accessibilityLastAudit:    '2026-07-18 (בדיקה פנימית)',
  accessibilityLevel:        'בתהליך — טרם הוצהרה עמידה רשמית בתקן',
  accessibilityContactEmail: PLATFORM_OPERATOR.accessibilityEmail,

  // ── internal flags (NOT FOR PUBLIC DISPLAY) ──────────────────────
  legallyReviewed:                             false,
  externalLegalReviewCompleted:                false,
  externalAccessibilityCertificationCompleted: false,
  penetrationTestCompleted:                    false,
} as const;

export type SubProcessor = typeof LEGAL.subprocessors[number];
