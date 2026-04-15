/**
 * field-map.ts — מפת שדות טופס 18ג (מינוי מפעיל מכונת הרמה)
 *
 * מערכת קואורדינטות: 595 × 842 px (A4), origin = top-left
 *
 * right: N  →  עוגן RTL  — קצה ימין של הטקסט במרחק N px מקצה ימין העמוד
 * left:  N  →  עוגן LTR  — קצה שמאל של הטקסט במרחק N px מקצה שמאל העמוד
 * top:   N  →  מרחק מהחלק העליון של העמוד (px)
 *
 * ─── איך לכייל ────────────────────────────────────────────────────────────
 * 1. ב-AppointmentPdfOverlay.tsx — שנה DEBUG_CALIBRATION = true
 * 2. צור מינוי חדש ופתח את ה-PDF שנוצר
 * 3. קווי ה-grid (כחול/אדום) + התיבות הירוקות מסמנים היכן עוגן כל שדה
 * 4. עדכן את ערכי top/right/left כאן עד שהתיבות יושבות על השדות הנכונים
 * 5. שנה DEBUG_CALIBRATION = false
 * ──────────────────────────────────────────────────────────────────────────
 */

export const FIELD_MAP = {
  // ── (א) ממנה ──────────────────────────────────────────────────────────────
  // appointerName:    was right:72  top:176 → ימינה 55 (right−55=17), למעלה 4 (top−4=172)
  appointerName:     { top: 172, right:  17 },
  // appointerAddress: was right:105 top:207 → ימינה 45 (right−45=60)
  appointerAddress:  { top: 207, right:  60 },
  // appointerZip:     was left:310  top:207 → ימינה 35 (left+35=345), למטה 2 (top+2=209)
  appointerZip:      { top: 209, left:  345 },   // LTR — מיקוד
  // appointerPhone:   was left:46   top:207 → ימינה 115 (left+115=161), למטה 2 (top+2=209)
  appointerPhone:    { top: 209, left:  161 },   // LTR — טלפון
  // appointerRole:    was right:72  top:225 → ימינה 40 (right−40=32), למעלה 2 (top−2=223)
  appointerRole:     { top: 223, right:  32 },

  // ── (ב) מכונה ─────────────────────────────────────────────────────────────
  // machineName:   was right:158 top:268 → ימינה 55 (right−55=103), למעלה 3 (top−3=265)
  machineName:       { top: 265, right: 103 },
  // manufacturer:  was right:428 top:268 → שמאלה 20 (right+20=448), למעלה 3 (top−3=265)
  manufacturer:      { top: 265, right: 448 },
  // machineId:     was left:290  top:288 → ימינה 25 (left+25=315)
  machineId:         { top: 288, left:  315 },   // LTR — מספר מזהה
  // safeLoad:      was right:430 top:288 → ימינה 35 (right−35=395)
  safeLoad:          { top: 288, right: 395 },
  // powerType:     was right:290 top:308 → ימינה 20 (right−20=270), למעלה 2 (top−2=306)
  powerType:         { top: 306, right: 270 },

  // ── (ג) מפעיל ────────────────────────────────────────────────────────────
  // lastName:   was right:183 top:368 → ימינה 10 (right−10=173)
  lastName:          { top: 368, right: 173 },
  // firstName:  was right:352 top:368 → ימינה 8  (right−8=344)
  firstName:         { top: 368, right: 344 },
  // fatherName: was right:468 top:368 → שמאלה 8  (right+8=476)
  fatherName:        { top: 368, right: 476 },
  // opId:       was left:335  top:388 → ימינה 18 (left+18=353)
  opId:              { top: 388, left:  353 },   // LTR — ת"ז
  // birthYear:  was left:198  top:388 → ימינה 12 (left+12=210)
  birthYear:         { top: 388, left:  210 },   // LTR — שנת לידה
  // profession: was right:468 top:388 → ימינה 15 (right−15=453)
  profession:        { top: 388, right: 453 },
  // opAddress:  was right:72  top:408 → ימינה 20 (right−20=52)
  opAddress:         { top: 408, right:  52 },

  // ── (ד) הצהרת הממנה ────────────────────────────────────────────────────────
  // apDeclDate: was left:402 top:555 → שמאלה 20 (left−20=382), למעלה 4 (top−4=551)
  apDeclDate:        { top: 551, left:  382 },   // LTR — תאריך
  // apDeclName: was right:198 top:555 → ימינה 35 (right−35=163), למעלה 4 (top−4=551)
  apDeclName:        { top: 551, right: 163 },
  // apSig:      was top:562 left:42 w:120 h:38 → ימינה 95 (left+95=137), למעלה 10 (top−10=552), −10% גודל
  apSig:             { top: 552, left:  137, w: 108, h: 34 },

  // ── (ה) הצהרת המפעיל ──────────────────────────────────────────────────────
  // opDeclDate: was left:402 top:692 → שמאלה 18 (left−18=384), למעלה 4 (top−4=688)
  opDeclDate:        { top: 688, left:  384 },   // LTR — תאריך
  // opDeclName: was right:198 top:692 → ימינה 30 (right−30=168), למעלה 4 (top−4=688)
  opDeclName:        { top: 688, right: 168 },
  // opSig:      was top:699 left:42 w:120 h:38 → ימינה 110 (left+110=152), למעלה 14 (top−14=685), −15% גודל
  opSig:             { top: 685, left:  152, w: 102, h: 32 },
} as const;

export type FieldMapKey = keyof typeof FIELD_MAP;
export type FieldPos = (typeof FIELD_MAP)[FieldMapKey];

/**
 * DBG_FIELDS — רשימת שדות לרינדור תיבות כיול ב-debug mode.
 * dbgW: רוחב משוער של התיבה (px) — לצורך הצגה בלבד, לא משפיע על הטקסט.
 */
export const DBG_FIELDS: {
  name: FieldMapKey;
  pos: { top: number; right?: number; left?: number };
  w: number;
  h: number;
}[] = [
  { name: 'appointerName',    pos: FIELD_MAP.appointerName,    w: 180, h: 14 },
  { name: 'appointerAddress', pos: FIELD_MAP.appointerAddress, w: 160, h: 14 },
  { name: 'appointerZip',     pos: FIELD_MAP.appointerZip,     w:  80, h: 14 },
  { name: 'appointerPhone',   pos: FIELD_MAP.appointerPhone,   w:  90, h: 14 },
  { name: 'appointerRole',    pos: FIELD_MAP.appointerRole,    w: 180, h: 14 },
  { name: 'machineName',      pos: FIELD_MAP.machineName,      w: 160, h: 14 },
  { name: 'manufacturer',     pos: FIELD_MAP.manufacturer,     w: 120, h: 14 },
  { name: 'machineId',        pos: FIELD_MAP.machineId,        w: 100, h: 14 },
  { name: 'safeLoad',         pos: FIELD_MAP.safeLoad,         w:  80, h: 14 },
  { name: 'powerType',        pos: FIELD_MAP.powerType,        w: 120, h: 14 },
  { name: 'lastName',         pos: FIELD_MAP.lastName,         w: 100, h: 14 },
  { name: 'firstName',        pos: FIELD_MAP.firstName,        w: 100, h: 14 },
  { name: 'fatherName',       pos: FIELD_MAP.fatherName,       w: 100, h: 14 },
  { name: 'opId',             pos: FIELD_MAP.opId,             w: 100, h: 14 },
  { name: 'birthYear',        pos: FIELD_MAP.birthYear,        w:  60, h: 14 },
  { name: 'profession',       pos: FIELD_MAP.profession,       w: 120, h: 14 },
  { name: 'opAddress',        pos: FIELD_MAP.opAddress,        w: 200, h: 14 },
  { name: 'apDeclDate',       pos: FIELD_MAP.apDeclDate,       w:  80, h: 14 },
  { name: 'apDeclName',       pos: FIELD_MAP.apDeclName,       w: 150, h: 14 },
  { name: 'apSig',            pos: FIELD_MAP.apSig,            w: FIELD_MAP.apSig.w, h: FIELD_MAP.apSig.h },
  { name: 'opDeclDate',       pos: FIELD_MAP.opDeclDate,       w:  80, h: 14 },
  { name: 'opDeclName',       pos: FIELD_MAP.opDeclName,       w: 150, h: 14 },
  { name: 'opSig',            pos: FIELD_MAP.opSig,            w: FIELD_MAP.opSig.w, h: FIELD_MAP.opSig.h },
];
