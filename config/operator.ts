/**
 * config/operator.ts — זהות מפעילת הפלטפורמה (SafeDoc)
 * נתן ולדמן ובניו בע"מ — הבעלים והמפתחים של תוכנת SafeDoc
 */

export const PLATFORM_OPERATOR = {
  name:           'נתן ולדמן ובניו בע"מ',
  nameEn:         'Natan Valdman & Sons Ltd.',
  registration:   '511664674',
  address:        'התבונה 4, אילת',
  phone:          '08-6378089',
  email:          'valdmann@012.net.il',
  privacyEmail:   'itayvm@gmail.com',
  accessibilityEmail: 'itayvm@gmail.com',
  supportEmail:   'itayvm@gmail.com',
  productName:    'SafeDoc',
  productUrl:     process.env.NEXT_PUBLIC_APP_URL ?? 'https://safety-system-henna.vercel.app',
} as const;
