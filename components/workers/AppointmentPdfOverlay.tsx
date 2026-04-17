'use client';

import React from 'react';
import { POWER_TYPE_LABELS, PowerType } from '@/types';
import { FM, DBG_FIELDS, TextField } from '@/lib/pdf/appointment-field-map';

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
// actual form blanks. Adjust values in lib/pdf/appointment-field-map.ts, then set back to false.
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
      {DBG_FIELDS.map(({ name, x, y, w, h }) => (
        <div key={`f-${name}`} style={{
          position: 'absolute',
          top: y,
          left: x,
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
      ))}
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

// ─── BASELINE OFFSET ─────────────────────────────────────────────────────────
// html2canvas renders text from top; the field map Y values mark the baseline.
// Shift text upward so the visual baseline aligns with the form line.
// Signatures are positioned by their top edge and use no offset.
const TEXT_BASELINE_OFFSET = 10;

// ─── TEXT FIELD ───────────────────────────────────────────────────────────────
function T({ v, f }: { v: string; f: TextField }) {
  if (!v) return null;
  return (
    <span
      style={{
        position: 'absolute',
        top: f.y - TEXT_BASELINE_OFFSET,
        left: f.x,
        width: f.w,
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 11,
        lineHeight: 1,
        color: '#000',
        whiteSpace: 'nowrap',
        direction: f.dir,
        unicodeBidi: f.dir === 'ltr' ? 'isolate' : 'plaintext',
        textAlign: f.align,
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
        <T v={data.appointer_name}    f={FM.appointer_name} />
        <T v={data.appointer_address} f={FM.appointer_address} />
        <T v={data.appointer_zip}     f={FM.appointer_zip} />
        <T v={data.appointer_phone}   f={FM.appointer_phone} />
        <T v={data.appointer_role}    f={FM.appointer_role} />

        {/* ── (ב) מכונה ── */}
        <T v={data.machine_name}       f={FM.machine_name} />
        <T v={data.manufacturer}       f={FM.manufacturer} />
        <T v={data.machine_identifier} f={FM.machine_identifier} />
        <T v={data.safe_working_load}  f={FM.safe_working_load} />
        <T v={powerLabel}              f={FM.power_type} />

        {/* ── (ג) מפעיל ── */}
        <T v={lastName}                f={FM.operator_last_name} />
        <T v={firstName}               f={FM.operator_first_name} />
        <T v={data.worker_father_name} f={FM.operator_father_name} />
        <T v={data.worker_id_number}   f={FM.operator_id} />
        <T v={data.worker_birth_year}  f={FM.operator_birth_year} />
        <T v={data.worker_profession}  f={FM.operator_profession} />
        <T v={data.worker_address}     f={FM.operator_address} />

        {/* ── (ד) הצהרת הממנה ── */}
        <T v={fmtDate(data.appointment_date)} f={FM.appointer_date} />
        <T v={data.appointer_name}            f={FM.appointer_name_line} />
        {data.appointer_sig && (
          <img
            src={data.appointer_sig}
            alt="חתימת ממנה"
            style={{
              position: 'absolute',
              top:    FM.appointer_signature.y,
              left:   FM.appointer_signature.x,
              width:  FM.appointer_signature.w,
              height: FM.appointer_signature.h,
              objectFit: 'contain',
            }}
          />
        )}

        {/* ── (ה) הצהרת המפעיל ── */}
        <T v={fmtDate(data.appointment_date)} f={FM.operator_date} />
        <T v={data.worker_full_name}          f={FM.operator_name_line} />
        {data.operator_sig && (
          <img
            src={data.operator_sig}
            alt="חתימת מפעיל"
            style={{
              position: 'absolute',
              top:    FM.operator_signature.y,
              left:   FM.operator_signature.x,
              width:  FM.operator_signature.w,
              height: FM.operator_signature.h,
              objectFit: 'contain',
            }}
          />
        )}
      </div>
    );
  }
);

export default AppointmentPdfOverlay;
