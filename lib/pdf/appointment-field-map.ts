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
  appointer_name:    rtl(404, 173, 210),   // x+20, y+6
  appointer_address: rtl(385, 213, 190),   // x+18, y+6
  appointer_zip:     ltr(350, 209,  80),   // x+5
  appointer_phone:   ltr(196, 209,  90),   // x+10
  appointer_role:    rtl(393, 229, 210),   // x+18, y+6

  // ── (ב) מכונה ─────────────────────────────────────────────────────────────
  machine_name:       rtl(336, 264, 190),  // x+20, y+4
  manufacturer:       rtl( 94, 269, 150),  // x+20, y+4
  machine_identifier: ltr(347, 288, 100),  // x+12
  safe_working_load:  rtl(128, 288,  80),  // x+10
  power_type:         rtl(227, 305, 150),  // x+10, y+4

  // ── (ג) מפעיל ────────────────────────────────────────────────────────────
  operator_last_name:   rtl(329, 372, 100),  // x+15, y+4
  operator_first_name:  rtl(162, 372, 100),  // x+15, y+4
  operator_father_name: rtl( 35, 372, 100),  // x+10, y+4
  operator_id:          ltr(383, 388, 100),  // x+12
  operator_birth_year:  ltr(213, 388,  60),  // x+8
  operator_profession:  rtl( 59, 388, 145),  // x+15
  operator_address:     rtl(355, 408, 270),  // x+20, w+40

  // ── (ד) הצהרת הממנה ────────────────────────────────────────────────────────
  appointer_date:       ltr(360, 554,  80),  // x+25, y+6
  appointer_name_line:  rtl(313, 555, 150),  // x+15, y+4
  appointer_signature:  sig(198, 532, 100, 28),  // x+20, y-6, h+4

  // ── (ה) הצהרת המפעיל ──────────────────────────────────────────────────────
  operator_date:        ltr(360, 691,  80),  // x+25, y+6
  operator_name_line:   rtl(310, 692, 150),  // x+15, y+4
  operator_signature:   sig(226, 664, 100, 26),  // x+25, y-6, h+4
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
