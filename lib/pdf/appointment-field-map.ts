/**
 * appointment-field-map.ts — מפת שדות מדויקת לטופס 18ג
 *
 * מערכת קואורדינטות: 595 × 842 px (A4), origin = top-left
 *
 * TextField: { x, y, w, align, dir }
 *   x     = קצה שמאל של תיבת הטקסט (px מקצה שמאל העמוד)
 *   y     = קצה עליון של הטקסט (px מקצה עליון העמוד)
 *   w     = רוחב התיבה (px)
 *   align = יישור הטקסט בתוך התיבה: 'right' לעברית, 'left' למספרים/תאריכים
 *   dir   = כיוון: 'rtl' לעברית, 'ltr' למספרים/תאריכים
 *
 * SigField: { x, y, w, h }
 *   x, y  = פינה עליונה-שמאלית של תמונת החתימה
 *   w, h  = רוחב וגובה (px)
 *
 * ─── כיול ──────────────────────────────────────────────────────────────────
 * 1. ב-AppointmentPdfOverlay.tsx שנה DEBUG_CALIBRATION = true
 * 2. צור מינוי חדש ופתח את ה-PDF שנוצר
 * 3. תיבות ירוקות = גבולות כל שדה; רשת כחול/אדום = עזרה לניווט
 * 4. עדכן x/y/w כאן עד שהתיבות יושבות על השדות הנכונים
 * 5. שנה DEBUG_CALIBRATION = false
 * ───────────────────────────────────────────────────────────────────────────
 */

export interface TextField {
  x: number;
  y: number;
  w: number;
  align: 'left' | 'right';
  dir: 'ltr' | 'rtl';
}

export interface SigField {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FMField = TextField | SigField;

/** עוגן RTL — טקסט עברי: x = קצה שמאל התיבה, ישור ימין */
function rtl(x: number, y: number, w: number): TextField {
  return { x, y, w, align: 'right', dir: 'rtl' };
}

/** עוגן LTR — מספרים/תאריכים: x = קצה שמאל התיבה, ישור שמאל */
function ltr(x: number, y: number, w: number): TextField {
  return { x, y, w, align: 'left', dir: 'ltr' };
}

/** תיבת חתימה */
function sig(x: number, y: number, w: number, h: number): SigField {
  return { x, y, w, h };
}

export const FM = {
  // ── (א) ממנה ──────────────────────────────────────────────────────────────
  // x = (595 − original_right) − w   |   מקור field-map.ts (כוייל ידנית)
  appointer_name:    rtl(386, 172, 180),   // x-12 → right_edge=566
  appointer_address: rtl(365, 207, 160),   // x-10 → right_edge=525
  appointer_zip:     ltr(345, 209,  80),   // LTR — ללא שינוי
  appointer_phone:   ltr(161, 209,  90),   // LTR — ללא שינוי
  appointer_role:    rtl(373, 223, 180),   // x-10 → right_edge=553

  // ── (ב) מכונה ─────────────────────────────────────────────────────────────
  machine_name:       rtl(322, 267, 160),  // x-10 y+2 → right_edge=482
  manufacturer:       rtl( 35, 267, 120),  // x+8  y+2 → right_edge=155
  machine_identifier: ltr(315, 288, 100),  // LTR — ללא שינוי
  safe_working_load:  rtl(120, 288,  80),  // ללא שינוי
  power_type:         rtl(211, 306, 120),  // x+6  → right_edge=331

  // ── (ג) מפעיל ────────────────────────────────────────────────────────────
  operator_last_name:   rtl(314, 368, 100),  // x-8 → right_edge=414
  operator_first_name:  rtl(143, 368, 100),  // x-8 → right_edge=243
  operator_father_name: rtl( 25, 368, 100),  // x+6 → right_edge=125
  operator_id:          ltr(353, 388, 100),  // LTR — ללא שינוי
  operator_birth_year:  ltr(210, 388,  60),  // LTR — ללא שינוי
  operator_profession:  rtl( 22, 388, 120),  // ללא שינוי
  operator_address:     rtl(335, 408, 200),  // x-8 → right_edge=535

  // ── (ד) הצהרת הממנה ────────────────────────────────────────────────────────
  appointer_date:       ltr(364, 551,  80),  // x-18
  appointer_name_line:  rtl(290, 551, 150),  // x+8  → right_edge=440
  appointer_signature:  sig(147, 574, 100, 30),  // x+10 y+6

  // ── (ה) הצהרת המפעיל ──────────────────────────────────────────────────────
  operator_date:        ltr(366, 688,  80),  // x-18
  operator_name_line:   rtl(285, 688, 150),  // x+8  → right_edge=435
  operator_signature:   sig(164, 698, 100, 30),  // x+12 y-8
} as const;

export type FMKey = keyof typeof FM;

/** isSigField — type guard */
export function isSigField(f: FMField): f is SigField {
  return 'h' in f;
}

/**
 * DBG_FIELDS — רשימת כל השדות לרינדור תיבות כיול ב-debug mode.
 */
export const DBG_FIELDS: { name: FMKey; x: number; y: number; w: number; h: number }[] =
  (Object.entries(FM) as [FMKey, FMField][]).map(([name, f]) => ({
    name,
    x: f.x,
    y: f.y,
    w: f.w,
    h: isSigField(f) ? f.h : 14,
  }));
