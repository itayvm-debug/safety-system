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
  appointer_name:    rtl(398, 172, 180),   // right_edge=578  (orig right:17)
  appointer_address: rtl(375, 207, 160),   // right_edge=535  (orig right:60)
  appointer_zip:     ltr(345, 209,  80),   // LTR  (orig left:345)
  appointer_phone:   ltr(161, 209,  90),   // LTR  (orig left:161)
  appointer_role:    rtl(383, 223, 180),   // right_edge=563  (orig right:32)

  // ── (ב) מכונה ─────────────────────────────────────────────────────────────
  machine_name:       rtl(332, 265, 160),  // right_edge=492  (orig right:103)
  manufacturer:       rtl( 27, 265, 120),  // right_edge=147  (orig right:448)
  machine_identifier: ltr(315, 288, 100),  // LTR  (orig left:315)
  safe_working_load:  rtl(120, 288,  80),  // right_edge=200  (orig right:395)
  power_type:         rtl(205, 306, 120),  // right_edge=325  (orig right:270)

  // ── (ג) מפעיל ────────────────────────────────────────────────────────────
  operator_last_name:   rtl(322, 368, 100),  // right_edge=422  (orig right:173)
  operator_first_name:  rtl(151, 368, 100),  // right_edge=251  (orig right:344)
  operator_father_name: rtl( 19, 368, 100),  // right_edge=119  (orig right:476)
  operator_id:          ltr(353, 388, 100),  // LTR  (orig left:353)
  operator_birth_year:  ltr(210, 388,  60),  // LTR  (orig left:210)
  operator_profession:  rtl( 22, 388, 120),  // right_edge=142  (orig right:453)
  operator_address:     rtl(343, 408, 200),  // right_edge=543  (orig right:52)

  // ── (ד) הצהרת הממנה ────────────────────────────────────────────────────────
  // טקסט y=551 (גובה ~14px → תחתית ~565) | חתימה y=568 (3px מרווח)
  appointer_date:       ltr(382, 551,  80),  // LTR  (orig left:382)
  appointer_name_line:  rtl(282, 551, 150),  // right_edge=432  (orig right:163)
  appointer_signature:  sig(137, 568, 100, 30),  // מתחת לטקסט  (orig left:137)

  // ── (ה) הצהרת המפעיל ──────────────────────────────────────────────────────
  // טקסט y=688 (גובה ~14px → תחתית ~702) | חתימה y=706 (4px מרווח)
  operator_date:        ltr(384, 688,  80),  // LTR  (orig left:384)
  operator_name_line:   rtl(277, 688, 150),  // right_edge=427  (orig right:168)
  operator_signature:   sig(152, 706, 100, 30),  // מתחת לטקסט  (orig left:152)
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
