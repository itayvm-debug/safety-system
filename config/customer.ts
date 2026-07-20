/**
 * config/customer.ts — זהות הלקוח (החברה המשתמשת במופע הספציפי)
 * יש למלא בעת Onboarding לקוח חדש
 */

export const CUSTOMER_ORGANIZATION = {
  name:        process.env.NEXT_PUBLIC_CUSTOMER_NAME        ?? 'SafeDoc',
  nameEn:      process.env.NEXT_PUBLIC_CUSTOMER_NAME_EN     ?? 'SafeDoc',
  registration: process.env.NEXT_PUBLIC_CUSTOMER_REG        ?? '',
  address:     process.env.NEXT_PUBLIC_CUSTOMER_ADDRESS     ?? '',
  phone:       process.env.NEXT_PUBLIC_CUSTOMER_PHONE       ?? '',
  contactEmail: process.env.NEXT_PUBLIC_CUSTOMER_EMAIL      ?? '',
  safetyEmail:  process.env.NEXT_PUBLIC_CUSTOMER_SAFETY_EMAIL ?? '',
  reportEmail:  process.env.REPORT_TO_EMAIL                 ?? '',
} as const;
