import { LEGAL } from '@/lib/legal/config';

export const CONSENT_COOKIE_NAME = 'safedoc_consented';

/** תוקף cookie הסכמה: שנה */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * גרסת ההסכמה המשולבת — שינוי גרסת תנאים או פרטיות דורש אישור מחדש.
 * ה-cookie שומר ערך זה; ה-DB הוא מקור האמת.
 */
export const CURRENT_CONSENT_VERSION = `${LEGAL.termsVersion}|${LEGAL.privacyVersion}`;
