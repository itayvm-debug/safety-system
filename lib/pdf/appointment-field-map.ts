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
  appointer_name:    rtl(406, 167, 180),
  appointer_address: rtl(385, 207, 160),
  appointer_zip:     ltr(353, 209,  80),
  appointer_phone:   ltr(176, 209,  90),
  appointer_role:    rtl(393, 223, 180),

  // ── (ב) מכונה ─────────────────────────────────────────────────────────────
  machine_name:       rtl(342, 260, 160),
  manufacturer:       rtl( 19, 265, 120),
  machine_identifier: ltr(323, 288, 100),
  safe_working_load:  rtl(130, 288,  80),
  power_type:         rtl(213, 301, 120),

  // ── (ג) מפעיל ────────────────────────────────────────────────────────────
  operator_last_name:   rtl(330, 368, 100),
  operator_first_name:  rtl(159, 368, 100),
  operator_father_name: rtl( 11, 368, 100),
  operator_id:          ltr(361, 388, 100),
  operator_birth_year:  ltr(215, 388,  60),
  operator_profession:  rtl( 32, 388, 120),
  operator_address:     rtl(351, 408, 200),

  // ── (ד) הצהרת הממנה ────────────────────────────────────────────────────────
  appointer_date:       ltr(377, 546,  80),
  appointer_name_line:  rtl(290, 551, 150),
  appointer_signature:  sig(152, 548, 100, 30),

  // ── (ה) הצהרת המפעיל ──────────────────────────────────────────────────────
  operator_date:        ltr(379, 683,  80),
  operator_name_line:   rtl(285, 688, 150),
  operator_signature:   sig(167, 684, 100, 30),
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
