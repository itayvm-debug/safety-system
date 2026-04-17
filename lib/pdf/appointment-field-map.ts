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
  appointer_name:    rtl(384, 167, 210),   // ←22, w:180→210
  appointer_address: rtl(367, 207, 190),   // ←18, w:160→190
  appointer_zip:     ltr(345, 209,  80),   // ←8
  appointer_phone:   ltr(186, 209,  90),   // →10
  appointer_role:    rtl(375, 223, 210),   // ←18, w:180→210

  // ── (ב) מכונה ─────────────────────────────────────────────────────────────
  machine_name:       rtl(316, 260, 190),  // ←26, w:160→190
  manufacturer:       rtl( 74, 265, 150),  // →55, w:120→150
  machine_identifier: ltr(335, 288, 100),  // →12
  safe_working_load:  rtl(118, 288,  80),  // ←12
  power_type:         rtl(217, 301, 150),  // →4, w:120→150

  // ── (ג) מפעיל ────────────────────────────────────────────────────────────
  operator_last_name:   rtl(314, 368, 100),  // ←16
  operator_first_name:  rtl(147, 368, 100),  // ←12
  operator_father_name: rtl( 25, 368, 100),  // →14
  operator_id:          ltr(371, 388, 100),  // →10
  operator_birth_year:  ltr(205, 388,  60),  // ←10
  operator_profession:  rtl( 44, 388, 145),  // →12, w:120→145
  operator_address:     rtl(335, 408, 230),  // ←16, w:200→230

  // ── (ד) הצהרת הממנה ────────────────────────────────────────────────────────
  appointer_date:       ltr(335, 548,  80),  // ←42, ↓2
  appointer_name_line:  rtl(298, 551, 150),  // →8
  appointer_signature:  sig(178, 538, 100, 24),  // →26, ↑10, h:30→24

  // ── (ה) הצהרת המפעיל ──────────────────────────────────────────────────────
  operator_date:        ltr(335, 685,  80),  // ←44, ↓2
  operator_name_line:   rtl(295, 688, 150),  // →10
  operator_signature:   sig(201, 670, 100, 22),  // →34, ↑14, h:30→22
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
