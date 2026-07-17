/**
 * config.ts — קבועים משפטיים מרכזיים
 * ⚠️ DRAFT — לסקירת עורך דין לפני פרסום
 * סמן TODO ב-placeholder שיש למלא לפני production
 */

export const LEGAL = {
  // ── זיהוי החברה ─────────────────────────────────────────────────
  companyName:          'נתן ולדמן ובניו בע"מ',
  companyNameEn:        'Natan Valdman & Sons Ltd.',
  companyRegistration:  '511664674',  // TODO
  companyAddress:       'התבונה 4, אילת',         // TODO
  companyPhone:         '08-6378089',          // TODO
  companyEmail:         'valdmann@012.net.il',  // TODO
  privacyContactEmail:  'itayvm@gmail.com', // TODO
  dpoName:               '', // TODO — אופציונלי

  // ── שם מוצר ─────────────────────────────────────────────────────
  productName:   'SafeDoc',
  productUrl:    'https://safety-system-henna.vercel.app',

  // ── תאריכים ─────────────────────────────────────────────────────
  /** תאריך תחולה של ה-ToS + Privacy הנוכחיים */
  termsEffectiveDate:   '2026-07-17',
  /** גרסת מסמכים — יש לעדכן בכל שינוי מהותי */
  termsVersion:         '1.0-draft',
  // ── retention defaults ───────────────────────────────────────────
  /** TODO: לאשר עם עורך דין */
  retentionWorkerDataYears:    7,   // שנים לשמירת נתוני עובדים אחרי סיום
  retentionDocumentFilesYears: 7,   // שנים לשמירת קבצי מסמכים
  retentionAuditLogsYears:     5,   // שנים לשמירת audit logs
  retentionSessionDays:        7,   // ימים תוקף session

  // ── sub-processors ───────────────────────────────────────────────
  subprocessors: [
    {
      name:    'Supabase, Inc.',
      country: 'יפן — AWS Tokyo (ap-northeast-1)',
      purpose: 'בסיס נתונים, אחסון קבצים ואימות משתמשים',
      dpUrl:   'https://supabase.com/privacy',
      dpa:     'יש לוודא את תחולת הסכם עיבוד המידע (DPA) לפני שימוש מסחרי',
    },
    {
      name:    'Vercel, Inc.',
      country: 'תשתית גלובלית של Vercel (Global Infrastructure)',
      purpose: 'אירוח האפליקציה, פונקציות שרת ותשתית ההפעלה',
      dpUrl:   'https://vercel.com/legal/privacy-policy',
      dpa:     'יש לוודא את תחולת הסכם עיבוד המידע (DPA) לפני שימוש מסחרי.',
    },
    {
      name: 'Resend, Inc.',
  country: 'עיבוד בינלאומי בהתאם לתנאי השירות ולספקי המשנה',
  purpose: 'שליחת הודעות ודוחות מערכת בדואר אלקטרוני',
  dpUrl: 'https://resend.com/legal/privacy-policy',
  dpa: 'יש לוודא את תחולת הסכם עיבוד המידע (DPA) לפני שימוש מסחרי.',
    },
  ],

  // ── WCAG / accessibility ─────────────────────────────────────────
  /** תאריך בדיקת נגישות אחרונה */
  accessibilityLastAudit: 'טרם בוצעה בדיקת נגישות מקצועית מלאה',
  /** רמת עמידה — אל תשנה ל-AA עד שהאודיט יאשר */
  accessibilityLevel:     'בתהליך בדיקה ושיפור — טרם הוצהרה עמידה בתקן',
  accessibilityContactEmail: 'itayvm@gmail.com', // TODO

  // ── drafts reminder ──────────────────────────────────────────────
  /** האם המסמכים עברו סקירת עורך דין */
  legallyReviewed: false,
} as const;

export type SubProcessor = typeof LEGAL.subprocessors[number];
