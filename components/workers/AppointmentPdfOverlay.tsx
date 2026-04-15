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

// ─── DEBUG CALIBRATION MODE ───────────────────────────────────────────────────
//
// Set DEBUG_CALIBRATION = true, then:
//   1. Create a new appointment → open the generated PDF
//   2. Grid lines mark every 50 px (blue=horizontal, red=vertical)
//   3. Green boxes show where each field is anchored
//   4. Adjust the values in L below until boxes sit on top of the form's blanks
//   5. Set DEBUG_CALIBRATION = false when done
//
const DEBUG_CALIBRATION = false;

// ─── FIELD MAP ────────────────────────────────────────────────────────────────
// Page size: 595 × 842 px (A4, matches the PDF template)
// Origin: top-left corner of the page
//
// Conventions:
//   right: N  →  RTL anchor — the RIGHT edge of the text is N px from the page's right edge
//   left:  N  →  LTR anchor — the LEFT  edge of the text is N px from the page's left edge
//
// All "top" values are the TOP edge of the text baseline row.
// ─────────────────────────────────────────────────────────────────────────────
const L = {
  // ─── (א) ממנה ───────────────────────────────────────────────────────────────
  appointerName:     { top: 176, right: 72  },
  appointerAddress:  { top: 207, right: 105 },
  appointerZip:      { top: 207, left:  310 },   // LTR — מיקוד
  appointerPhone:    { top: 207, left:   46 },   // LTR — טלפון
  appointerRole:     { top: 225, right:  72 },

  // ─── (ב) מכונה ──────────────────────────────────────────────────────────────
  machineName:       { top: 268, right: 158 },
  manufacturer:      { top: 268, right: 428 },
  machineId:         { top: 288, left:  290 },   // LTR — מספר מזהה
  safeLoad:          { top: 288, right: 430 },
  powerType:         { top: 308, right: 290 },

  // ─── (ג) מפעיל ──────────────────────────────────────────────────────────────
  lastName:          { top: 368, right: 183 },
  firstName:         { top: 368, right: 352 },
  fatherName:        { top: 368, right: 468 },
  opId:              { top: 388, left:  335 },   // LTR — ת"ז
  birthYear:         { top: 388, left:  198 },   // LTR — שנת לידה
  profession:        { top: 388, right: 468 },
  opAddress:         { top: 408, right:  72 },

  // ─── (ד) הצהרת הממנה ────────────────────────────────────────────────────────
  apDeclDate:        { top: 555, left:  402 },   // LTR — תאריך
  apDeclName:        { top: 555, right: 198 },
  apSig:             { top: 562, left:   42, w: 120, h: 38 },

  // ─── (ה) הצהרת המפעיל ───────────────────────────────────────────────────────
  opDeclDate:        { top: 692, left:  402 },   // LTR — תאריך
  opDeclName:        { top: 692, right: 198 },
  opSig:             { top: 699, left:   42, w: 120, h: 38 },
} as const;

// ─── DEBUG FIELD REGISTRY ─────────────────────────────────────────────────────
// Used only when DEBUG_CALIBRATION = true.
// dbgW: approximate display width of the field (pixels) — used to draw the box.
// Sig fields use their declared w/h from L.
type AnchorPos = { top: number; right?: number; left?: number };
const DBG_FIELDS: { name: string; pos: AnchorPos; w: number; h: number }[] = [
  { name: 'appointerName',    pos: L.appointerName,    w: 180, h: 14 },
  { name: 'appointerAddress', pos: L.appointerAddress, w: 160, h: 14 },
  { name: 'appointerZip',     pos: L.appointerZip,     w:  80, h: 14 },
  { name: 'appointerPhone',   pos: L.appointerPhone,   w:  90, h: 14 },
  { name: 'appointerRole',    pos: L.appointerRole,    w: 180, h: 14 },
  { name: 'machineName',      pos: L.machineName,      w: 160, h: 14 },
  { name: 'manufacturer',     pos: L.manufacturer,     w: 120, h: 14 },
  { name: 'machineId',        pos: L.machineId,        w: 100, h: 14 },
  { name: 'safeLoad',         pos: L.safeLoad,         w:  80, h: 14 },
  { name: 'powerType',        pos: L.powerType,        w: 120, h: 14 },
  { name: 'lastName',         pos: L.lastName,         w: 100, h: 14 },
  { name: 'firstName',        pos: L.firstName,        w: 100, h: 14 },
  { name: 'fatherName',       pos: L.fatherName,       w: 100, h: 14 },
  { name: 'opId',             pos: L.opId,             w: 100, h: 14 },
  { name: 'birthYear',        pos: L.birthYear,        w:  60, h: 14 },
  { name: 'profession',       pos: L.profession,       w: 120, h: 14 },
  { name: 'opAddress',        pos: L.opAddress,        w: 200, h: 14 },
  { name: 'apDeclDate',       pos: L.apDeclDate,       w:  80, h: 14 },
  { name: 'apDeclName',       pos: L.apDeclName,       w: 150, h: 14 },
  { name: 'apSig',            pos: L.apSig,            w: L.apSig.w,  h: L.apSig.h  },
  { name: 'opDeclDate',       pos: L.opDeclDate,       w:  80, h: 14 },
  { name: 'opDeclName',       pos: L.opDeclName,       w: 150, h: 14 },
  { name: 'opSig',            pos: L.opSig,            w: L.opSig.w,  h: L.opSig.h  },
];

// ─── CALIBRATION LAYER (rendered only when DEBUG_CALIBRATION = true) ──────────
function CalibrationLayer() {
  const hTicks = Array.from({ length: 16 }, (_, i) => (i + 1) * 50).filter((y) => y <= 800);
  const vTicks = Array.from({ length: 11 }, (_, i) => (i + 1) * 50).filter((x) => x <= 550);

  return (
    <>
      {/* ── Horizontal grid lines (blue) ─────────────────────── */}
      {hTicks.map((y) => (
        <React.Fragment key={`h${y}`}>
          <div style={{
            position: 'absolute', top: y, left: 0, right: 0, height: 1,
            background: y % 100 === 0 ? 'rgba(0,0,200,0.35)' : 'rgba(0,0,200,0.12)',
          }} />
          <span style={{
            position: 'absolute', top: y + 1, left: 2,
            fontSize: 7, lineHeight: 1, fontFamily: 'monospace',
            color: 'rgba(0,0,200,0.7)', background: 'rgba(255,255,255,0.7)',
          }}>{y}</span>
        </React.Fragment>
      ))}

      {/* ── Vertical grid lines (red) ────────────────────────── */}
      {vTicks.map((x) => (
        <React.Fragment key={`v${x}`}>
          <div style={{
            position: 'absolute', left: x, top: 0, bottom: 0, width: 1,
            background: x % 100 === 0 ? 'rgba(200,0,0,0.35)' : 'rgba(200,0,0,0.12)',
          }} />
          <span style={{
            position: 'absolute', left: x + 2, top: 2,
            fontSize: 7, lineHeight: 1, fontFamily: 'monospace',
            color: 'rgba(200,0,0,0.7)', background: 'rgba(255,255,255,0.7)',
          }}>{x}</span>
        </React.Fragment>
      ))}

      {/* ── Field anchor boxes (green) ───────────────────────── */}
      {DBG_FIELDS.map(({ name, pos, w, h }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = pos as any;
        const anchor = p.right !== undefined ? { right: p.right } : { left: p.left };
        return (
          <div key={`f-${name}`} style={{
            position: 'absolute',
            top: pos.top,
            ...anchor,
            width: w,
            height: h,
            border: '1.5px solid rgba(0,140,0,0.85)',
            background: 'rgba(0,220,0,0.15)',
            boxSizing: 'border-box',
          }}>
            <span style={{
              position: 'absolute', top: -9, right: 0,
              fontSize: 6, lineHeight: 1, fontFamily: 'monospace',
              color: '#004400', background: 'rgba(210,255,210,0.95)',
              padding: '0 2px', whiteSpace: 'nowrap',
            }}>{name}</span>
          </div>
        );
      })}
    </>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

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

// ─── TEXT FIELD ───────────────────────────────────────────────────────────────
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

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const AppointmentPdfOverlay = React.forwardRef<HTMLDivElement, OverlayData>(
  function AppointmentPdfOverlay(data, ref) {
    const [firstName, lastName] = splitName(data.worker_full_name);
    const powerLabel = data.power_type
      ? (POWER_TYPE_LABELS[data.power_type as PowerType] ?? '')
      : '';

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
        {/* Calibration grid + field boxes — visible only when DEBUG_CALIBRATION = true */}
        {DEBUG_CALIBRATION && <CalibrationLayer />}

        {/* ── (א) ממנה ── */}
        <T v={data.appointer_name}    pos={L.appointerName} />
        <T v={data.appointer_address} pos={L.appointerAddress} />
        <T v={data.appointer_zip}     pos={L.appointerZip}  ltr />
        <T v={data.appointer_phone}   pos={L.appointerPhone} ltr />
        <T v={data.appointer_role}    pos={L.appointerRole} />

        {/* ── (ב) מכונה ── */}
        <T v={data.machine_name}       pos={L.machineName} />
        <T v={data.manufacturer}       pos={L.manufacturer} />
        <T v={data.machine_identifier} pos={L.machineId} ltr />
        <T v={data.safe_working_load}  pos={L.safeLoad} />
        <T v={powerLabel}              pos={L.powerType} />

        {/* ── (ג) מפעיל ── */}
        <T v={lastName}                pos={L.lastName} />
        <T v={firstName}               pos={L.firstName} />
        <T v={data.worker_father_name} pos={L.fatherName} />
        <T v={data.worker_id_number}   pos={L.opId}  ltr />
        <T v={data.worker_birth_year}  pos={L.birthYear} ltr />
        <T v={data.worker_profession}  pos={L.profession} />
        <T v={data.worker_address}     pos={L.opAddress} />

        {/* ── (ד) הצהרת הממנה ── */}
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

        {/* ── (ה) הצהרת המפעיל ── */}
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
