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
  appointerName:     { top: 176, right:  72 },
  appointerAddress:  { top: 207, right: 105 },
  appointerZip:      { top: 207, left:  310 },   // LTR — מיקוד
  appointerPhone:    { top: 207, left:   46 },   // LTR — טלפון
  appointerRole:     { top: 225, right:  72 },

  // ── (ב) מכונה ─────────────────────────────────────────────────────────────
  machineName:       { top: 268, right: 158 },
  manufacturer:      { top: 268, right: 428 },
  machineId:         { top: 288, left:  290 },   // LTR — מספר מזהה
  safeLoad:          { top: 288, right: 430 },
  powerType:         { top: 308, right: 290 },

  // ── (ג) מפעיל ────────────────────────────────────────────────────────────
  lastName:          { top: 368, right: 183 },
  firstName:         { top: 368, right: 352 },
  fatherName:        { top: 368, right: 468 },
  opId:              { top: 388, left:  335 },   // LTR — ת"ז
  birthYear:         { top: 388, left:  198 },   // LTR — שנת לידה
  profession:        { top: 388, right: 468 },
  opAddress:         { top: 408, right:  72 },

  // ── (ד) הצהרת הממנה ────────────────────────────────────────────────────────
  apDeclDate:        { top: 555, left:  402 },   // LTR — תאריך
  apDeclName:        { top: 555, right: 198 },
  apSig:             { top: 562, left:   42, w: 120, h: 38 },

  // ── (ה) הצהרת המפעיל ──────────────────────────────────────────────────────
  opDeclDate:        { top: 692, left:  402 },   // LTR — תאריך
  opDeclName:        { top: 692, right: 198 },
  opSig:             { top: 699, left:   42, w: 120, h: 38 },
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
