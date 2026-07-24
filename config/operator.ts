/**
 * config/operator.ts — זהות מפעיל הפלטפורמה (SafeDoc)
 * איתי ולדמן — הבעלים והמפתח של תוכנת SafeDoc
 */

export const PLATFORM_OPERATOR = {
  operatorName:              'איתי ולדמן',
  legalOperatorName:         'איתי ולדמן',
  brandName:                 'SafeDoc',
  operatorBrand:             'SafeDoc',
  operatorEmail:             'itayvm@gmail.com',
  privacyContactEmail:       'itayvm@gmail.com',
  accessibilityContactEmail: 'itayvm@gmail.com',
  supportEmail:              'itayvm@gmail.com',
  operatorPhone:             '053-8000993',
  productName:               'SafeDoc',
  productUrl:                process.env.NEXT_PUBLIC_APP_URL ?? 'https://safety-system-henna.vercel.app',
} as const;
