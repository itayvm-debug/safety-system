'use client';

import React from 'react';
import { POWER_TYPE_LABELS, PowerType } from '@/types';

export interface OverlayData {
  appointer_name: string;
  appointer_address: string;
  appointer_zip: string;
  appointer_phone: string;
  appointer_role: string;
  machine_name: string;
  manufacturer: string;
  machine_identifier: string;
  safe_working_load: string;
  power_type: PowerType | '';
  worker_full_name: string;
  worker_id_number: string;
  worker_father_name: string;
  worker_birth_year: string;
  worker_profession: string;
  worker_address: string;
  appointment_date: string;       // YYYY-MM-DD
  appointer_sig?: string | null;  // data URL (base64 PNG)
  operator_sig?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// קואורדינטות — ערכי top/right/left בפיקסלים, origin = top-left של 595×842
//
// כיצד לכייל:
//   1. צור מינוי, פתח את ה-PDF שנשמר
//   2. השווה את מיקום הטקסט שהוטבע מול הנקודות של הטופס
//   3. עדכן top/right/left בהתאם ושמור
//
// מוסכמות:
//   right:X  — עברית RTL  — קצה ימין של הטקסט במרחק X מקצה ימין העמוד
//   left:X   — LTR        — קצה שמאל של הטקסט במרחק X מקצה שמאל העמוד
// ─────────────────────────────────────────────────────────────────────────────
const L = {
  // (א) ממנה
  appointerName:     { top: 176, right: 72 },
  appointerAddress:  { top: 207, right: 105 },
  appointerZip:      { top: 207, left: 310 },   // LTR
  appointerPhone:    { top: 207, left: 46 },    // LTR
  appointerRole:     { top: 225, right: 72 },

  // (ב) מכונה
  machineName:       { top: 268, right: 158 },
  manufacturer:      { top: 268, right: 428 },
  machineId:         { top: 288, left: 290 },   // LTR
  safeLoad:          { top: 288, right: 430 },
  powerType:         { top: 308, right: 290 },

  // (ג) מפעיל
  lastName:          { top: 368, right: 183 },
  firstName:         { top: 368, right: 352 },
  fatherName:        { top: 368, right: 468 },
  opId:              { top: 388, left: 335 },   // LTR
  birthYear:         { top: 388, left: 198 },   // LTR
  profession:        { top: 388, right: 468 },
  opAddress:         { top: 408, right: 72 },

  // (ד) הצהרת הממנה
  apDeclDate:        { top: 555, left: 402 },   // LTR
  apDeclName:        { top: 555, right: 198 },
  apSig: { top: 562, left: 42, w: 120, h: 38 },

  // (ה) הצהרת המפעיל
  opDeclDate:        { top: 692, left: 402 },   // LTR
  opDeclName:        { top: 692, right: 198 },
  opSig: { top: 699, left: 42, w: 120, h: 38 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d ? `${d}/${m}/${y}` : iso;
}

function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return [full, ''];
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]];
}

// ── רכיב שדה טקסט יחיד ───────────────────────────────────────────────────────
function T({
  v,
  pos,
  ltr = false,
}: {
  v: string;
  pos: { top: number; right?: number; left?: number };
  ltr?: boolean;
}) {
  if (!v) return null;
  return (
    <span
      style={{
        position: 'absolute',
        top: pos.top,
        ...(pos.right !== undefined ? { right: pos.right } : { left: pos.left }),
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 11,
        lineHeight: 1,
        color: '#000',
        whiteSpace: 'nowrap',
        direction: ltr ? 'ltr' : 'rtl',
        unicodeBidi: ltr ? 'isolate' : 'plaintext',
        textAlign: ltr ? 'left' : 'right',
      }}
    >
      {v}
    </span>
  );
}

// ── הרכיב הראשי ───────────────────────────────────────────────────────────────
const AppointmentPdfOverlay = React.forwardRef<HTMLDivElement, OverlayData>(
  function AppointmentPdfOverlay(data, ref) {
    const [firstName, lastName] = splitName(data.worker_full_name);
    const powerLabel = data.power_type ? (POWER_TYPE_LABELS[data.power_type as PowerType] ?? '') : '';

    return (
      <div
        ref={ref}
        style={{
          position: 'relative',
          width: 595,
          height: 842,
          overflow: 'hidden',
          background: 'transparent',
        }}
      >
        {/* (א) ממנה */}
        <T v={data.appointer_name}    pos={L.appointerName} />
        <T v={data.appointer_address} pos={L.appointerAddress} />
        <T v={data.appointer_zip}     pos={L.appointerZip}  ltr />
        <T v={data.appointer_phone}   pos={L.appointerPhone} ltr />
        <T v={data.appointer_role}    pos={L.appointerRole} />

        {/* (ב) מכונה */}
        <T v={data.machine_name}       pos={L.machineName} />
        <T v={data.manufacturer}       pos={L.manufacturer} />
        <T v={data.machine_identifier} pos={L.machineId} ltr />
        <T v={data.safe_working_load}  pos={L.safeLoad} />
        <T v={powerLabel}              pos={L.powerType} />

        {/* (ג) מפעיל */}
        <T v={lastName}                pos={L.lastName} />
        <T v={firstName}               pos={L.firstName} />
        <T v={data.worker_father_name} pos={L.fatherName} />
        <T v={data.worker_id_number}   pos={L.opId}  ltr />
        <T v={data.worker_birth_year}  pos={L.birthYear} ltr />
        <T v={data.worker_profession}  pos={L.profession} />
        <T v={data.worker_address}     pos={L.opAddress} />

        {/* (ד) הצהרת הממנה */}
        <T v={fmtDate(data.appointment_date)} pos={L.apDeclDate} ltr />
        <T v={data.appointer_name}     pos={L.apDeclName} />
        {data.appointer_sig && (
          <img
            src={data.appointer_sig}
            alt="חתימת ממנה"
            style={{
              position: 'absolute',
              top: L.apSig.top,
              left: L.apSig.left,
              width: L.apSig.w,
              height: L.apSig.h,
              objectFit: 'contain',
            }}
          />
        )}

        {/* (ה) הצהרת המפעיל */}
        <T v={fmtDate(data.appointment_date)} pos={L.opDeclDate} ltr />
        <T v={data.worker_full_name}   pos={L.opDeclName} />
        {data.operator_sig && (
          <img
            src={data.operator_sig}
            alt="חתימת מפעיל"
            style={{
              position: 'absolute',
              top: L.opSig.top,
              left: L.opSig.left,
              width: L.opSig.w,
              height: L.opSig.h,
              objectFit: 'contain',
            }}
          />
        )}
      </div>
    );
  }
);

export default AppointmentPdfOverlay;
