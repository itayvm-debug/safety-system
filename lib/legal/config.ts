/**
 * config.ts — קבועים משפטיים מרכזיים
 * ⚠️ DRAFT — לסקירת עורך דין לפני פרסום
 */

export const LEGAL = {
  // ── זיהוי החברה ─────────────────────────────────────────────────
  companyName:          'נתן ולדמן ובניו בע"מ',
  companyNameEn:        'Natan Valdman & Sons Ltd.',
  companyRegistration:  '511664674',
  companyAddress:       'התבונה 4, אילת',
  companyPhone:         '08-6378089',
  companyEmail:         'valdmann@012.net.il',
  privacyContactEmail:  'itayvm@gmail.com',
  dpoName:               '',

  // ── שם מוצר ─────────────────────────────────────────────────────
  productName:   'SafeDoc',
  productUrl:    'https://safety-system-henna.vercel.app',

  // ── תאריכים ─────────────────────────────────────────────────────
  /** תאריך תחולה של גרסת המסמכים הנוכחית */
  termsEffectiveDate: '2026-07-17',

  // ── גרסאות מסמכים — יש לעדכן בכל שינוי מהותי ─────────────────
  /** גרסת תנאי שימוש — שינוי דורש אישור מחדש מהמשתמשים */
  termsVersion:        '1.0-draft.2',
  /** גרסת מדיניות פרטיות — שינוי דורש אישור מחדש מהמשתמשים */
  privacyVersion:      '1.0-draft.2',
  /** גרסת הצהרת נגישות — שינוי אינו דורש אישור מחדש */
  accessibilityVersion: '1.0-draft.1',

  // ── retention defaults ───────────────────────────────────────────
  /** TODO: לאשר עם עורך דין */
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
  accessibilityLastAudit:      '2026-07-17 (בדיקה פנימית ראשונית)',
  accessibilityLevel:          'בתהליך — טרם הוצהרה עמידה בתקן WCAG AA',
  accessibilityContactEmail:   'itayvm@gmail.com',

  // ── drafts reminder ──────────────────────────────────────────────
  /** האם המסמכים עברו סקירת עורך דין */
  legallyReviewed: false,
} as const;

export type SubProcessor = typeof LEGAL.subprocessors[number];
