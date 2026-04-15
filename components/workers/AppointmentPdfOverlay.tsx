'use client';

import React from 'react';
import { POWER_TYPE_LABELS, PowerType } from '@/types';
import { FIELD_MAP, DBG_FIELDS } from '@/lib/pdf/field-map';

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
// Set to true, generate a PDF, and compare the green field boxes with the
// actual form blanks. Adjust values in lib/pdf/field-map.ts, then set back to false.
const DEBUG_CALIBRATION = false;

// ─── CALIBRATION LAYER ────────────────────────────────────────────────────────
function CalibrationLayer() {
  const hTicks = Array.from({ length: 16 }, (_, i) => (i + 1) * 50).filter((y) => y <= 800);
  const vTicks = Array.from({ length: 11 }, (_, i) => (i + 1) * 50).filter((x) => x <= 550);

  return (
    <>
      {/* Horizontal grid lines — blue */}
      {hTicks.map((y) => (
        <React.Fragment key={`h${y}`}>
          <div style={{
            position: 'absolute', top: y, left: 0, right: 0, height: 1,
            background: y % 100 === 0 ? 'rgba(0,0,200,0.35)' : 'rgba(0,0,200,0.12)',
          }} />
          <span style={{
            position: 'absolute', top: y + 1, left: 2,
            fontSize: 7, lineHeight: 1, fontFamily: 'monospace',
            color: 'rgba(0,0,200,0.75)', background: 'rgba(255,255,255,0.75)',
          }}>{y}</span>
        </React.Fragment>
      ))}

      {/* Vertical grid lines — red */}
      {vTicks.map((x) => (
        <React.Fragment key={`v${x}`}>
          <div style={{
            position: 'absolute', left: x, top: 0, bottom: 0, width: 1,
            background: x % 100 === 0 ? 'rgba(200,0,0,0.35)' : 'rgba(200,0,0,0.12)',
          }} />
          <span style={{
            position: 'absolute', left: x + 2, top: 2,
            fontSize: 7, lineHeight: 1, fontFamily: 'monospace',
            color: 'rgba(200,0,0,0.75)', background: 'rgba(255,255,255,0.75)',
          }}>{x}</span>
        </React.Fragment>
      ))}

      {/* Field anchor boxes — green */}
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
        {DEBUG_CALIBRATION && <CalibrationLayer />}

        {/* ── (א) ממנה ── */}
        <T v={data.appointer_name}    pos={FIELD_MAP.appointerName} />
        <T v={data.appointer_address} pos={FIELD_MAP.appointerAddress} />
        <T v={data.appointer_zip}     pos={FIELD_MAP.appointerZip}  ltr />
        <T v={data.appointer_phone}   pos={FIELD_MAP.appointerPhone} ltr />
        <T v={data.appointer_role}    pos={FIELD_MAP.appointerRole} />

        {/* ── (ב) מכונה ── */}
        <T v={data.machine_name}       pos={FIELD_MAP.machineName} />
        <T v={data.manufacturer}       pos={FIELD_MAP.manufacturer} />
        <T v={data.machine_identifier} pos={FIELD_MAP.machineId} ltr />
        <T v={data.safe_working_load}  pos={FIELD_MAP.safeLoad} />
        <T v={powerLabel}              pos={FIELD_MAP.powerType} />

        {/* ── (ג) מפעיל ── */}
        <T v={lastName}                pos={FIELD_MAP.lastName} />
        <T v={firstName}               pos={FIELD_MAP.firstName} />
        <T v={data.worker_father_name} pos={FIELD_MAP.fatherName} />
        <T v={data.worker_id_number}   pos={FIELD_MAP.opId}  ltr />
        <T v={data.worker_birth_year}  pos={FIELD_MAP.birthYear} ltr />
        <T v={data.worker_profession}  pos={FIELD_MAP.profession} />
        <T v={data.worker_address}     pos={FIELD_MAP.opAddress} />

        {/* ── (ד) הצהרת הממנה ── */}
        <T v={fmtDate(data.appointment_date)} pos={FIELD_MAP.apDeclDate} ltr />
        <T v={data.appointer_name}            pos={FIELD_MAP.apDeclName} />
        {data.appointer_sig && (
          <img
            src={data.appointer_sig}
            alt="חתימת ממנה"
            style={{
              position: 'absolute',
              top:    FIELD_MAP.apSig.top,
              left:   FIELD_MAP.apSig.left,
              width:  FIELD_MAP.apSig.w,
              height: FIELD_MAP.apSig.h,
              objectFit: 'contain',
            }}
          />
        )}

        {/* ── (ה) הצהרת המפעיל ── */}
        <T v={fmtDate(data.appointment_date)} pos={FIELD_MAP.opDeclDate} ltr />
        <T v={data.worker_full_name}          pos={FIELD_MAP.opDeclName} />
        {data.operator_sig && (
          <img
            src={data.operator_sig}
            alt="חתימת מפעיל"
            style={{
              position: 'absolute',
              top:    FIELD_MAP.opSig.top,
              left:   FIELD_MAP.opSig.left,
              width:  FIELD_MAP.opSig.w,
              height: FIELD_MAP.opSig.h,
              objectFit: 'contain',
            }}
          />
        )}
      </div>
    );
  }
);

export default AppointmentPdfOverlay;
