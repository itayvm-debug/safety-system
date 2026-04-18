'use client';

import React from 'react';
import { POWER_TYPE_LABELS, PowerType, AppointmentMachine } from '@/types';

// ─── טיפוס נתוני המסמך ────────────────────────────────────────────────────────
export interface AppointmentDocData {
  appointer_name: string;
  appointer_address: string;
  appointer_zip: string;
  appointer_phone: string;
  appointer_role: string;
  machines: AppointmentMachine[];
  worker_full_name: string;
  worker_id_number: string;
  worker_father_name: string;
  worker_birth_year: string;
  worker_profession: string;
  worker_address: string;
  appointment_date: string; // YYYY-MM-DD
  appointer_sig?: string | null;
  operator_sig?: string | null;
  logoSrc?: string;
}

// ─── עזרים ────────────────────────────────────────────────────────────────────
function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d ? `${d}/${m}/${y}` : iso;
}

const S = {
  page: {
    width: 595,
    backgroundColor: '#ffffff',
    padding: '24px 32px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    boxSizing: 'border-box' as const,
    direction: 'rtl' as const,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ea580c',
    borderRadius: 3,
    padding: '4px 10px',
    marginBottom: 8,
    marginTop: 12,
  },
  sectionLetter: { fontFamily: 'Arial', fontSize: 11, fontWeight: 'bold' as const, color: '#fff' },
  sectionTitle: { fontFamily: 'Arial', fontSize: 11, color: '#fff' },
  fieldRow: { display: 'flex', gap: 10, marginBottom: 6, direction: 'rtl' as const },
  fieldWrap: { display: 'flex', alignItems: 'baseline', gap: 3, flex: 1 },
  fieldLabel: { fontFamily: 'Arial', fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' as const },
  fieldValue: (ltr = false): React.CSSProperties => ({
    flex: 1,
    borderBottom: '1px solid #9ca3af',
    fontFamily: 'Arial',
    fontSize: 11,
    color: '#111',
    paddingBottom: 1,
    direction: ltr ? 'ltr' : 'rtl',
    textAlign: ltr ? 'left' : 'right',
    minWidth: 40,
  }),
  declarationBox: {
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    padding: '8px 10px',
    backgroundColor: '#f9fafb',
    marginBottom: 10,
    fontFamily: 'Arial',
    fontSize: 10.5,
    color: '#374151',
    lineHeight: 1.75,
    direction: 'rtl' as const,
    textAlign: 'right' as const,
  },
} as const;

// ─── כותרת סעיף ───────────────────────────────────────────────────────────────
function SH({ l, t }: { l: string; t: string }) {
  return (
    <div style={S.sectionHeader}>
      <span style={S.sectionLetter}>{l}</span>
      <span style={S.sectionTitle}>{t}</span>
    </div>
  );
}

// ─── שדה ──────────────────────────────────────────────────────────────────────
function F({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div style={S.fieldWrap}>
      <span style={S.fieldLabel}>{label}:</span>
      <span style={S.fieldValue(ltr)}>{value || '\u00a0'}</span>
    </div>
  );
}

// ─── שורת שדות ────────────────────────────────────────────────────────────────
function Row({ children }: { children: React.ReactNode }) {
  return <div style={S.fieldRow}>{children}</div>;
}

// ─── בלוק חתימה ───────────────────────────────────────────────────────────────
function SigBlock({ label, name, date, sig }: { label: string; name: string; date: string; sig?: string | null }) {
  const lineStyle: React.CSSProperties = {
    height: 50,
    borderBottom: '1px solid #374151',
    fontFamily: 'Arial',
    fontSize: 11,
    color: '#111',
    paddingTop: 4,
  };
  return (
    <div style={{ display: 'flex', gap: 12, direction: 'rtl', alignItems: 'flex-end', marginTop: 4 }}>
      <div style={{ flex: 1.3 }}>
        <div style={{ fontFamily: 'Arial', fontSize: 10, color: '#6b7280', marginBottom: 3 }}>{label}:</div>
        {sig ? (
          <img src={sig} alt={label} style={{ width: '100%', height: 50, objectFit: 'contain', display: 'block', borderBottom: '1px solid #374151' }} />
        ) : (
          <div style={lineStyle} />
        )}
      </div>
      <div style={{ flex: 1.5 }}>
        <div style={{ fontFamily: 'Arial', fontSize: 10, color: '#6b7280', marginBottom: 3 }}>שם:</div>
        <div style={lineStyle}>{name}</div>
      </div>
      <div style={{ flex: 0.8 }}>
        <div style={{ fontFamily: 'Arial', fontSize: 10, color: '#6b7280', marginBottom: 3 }}>תאריך:</div>
        <div style={{ ...lineStyle, direction: 'ltr', textAlign: 'left' }}>{date}</div>
      </div>
    </div>
  );
}

// ─── טבלת מכונות ──────────────────────────────────────────────────────────────
function MachinesTable({ machines }: { machines: AppointmentMachine[] }) {
  if (machines.length === 1) {
    const m = machines[0];
    const powerLabel = m.power_type ? (POWER_TYPE_LABELS[m.power_type as PowerType] ?? m.power_type) : '';
    return (
      <div style={{ padding: '0 6px 2px' }}>
        <Row>
          <F label="שם המכונה" value={m.machine_name} />
          <F label="יצרן" value={m.manufacturer ?? ''} />
        </Row>
        <Row>
          <F label="מספר מזהה" value={m.machine_identifier ?? ''} ltr />
          <F label="עומס עבודה בטוח" value={m.safe_working_load ?? ''} />
          <F label="סוג הפעלה" value={powerLabel} />
        </Row>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 6px 2px' }}>
      {machines.map((m, i) => {
        const powerLabel = m.power_type ? (POWER_TYPE_LABELS[m.power_type as PowerType] ?? m.power_type) : '';
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: 'Arial', fontSize: 10.5, fontWeight: 'bold', color: '#374151', marginBottom: 4 }}>
              מכונה {i + 1}:
            </div>
            <Row>
              <F label="שם המכונה" value={m.machine_name} />
              <F label="יצרן" value={m.manufacturer ?? ''} />
            </Row>
            <Row>
              <F label="מספר מזהה" value={m.machine_identifier ?? ''} ltr />
              <F label="עומס עבודה בטוח" value={m.safe_working_load ?? ''} />
              <F label="סוג הפעלה" value={powerLabel} />
            </Row>
          </div>
        );
      })}
    </div>
  );
}

// ─── רכיב ראשי ────────────────────────────────────────────────────────────────
const LiftingMachineAppointmentDoc = React.forwardRef<HTMLDivElement, AppointmentDocData>(
  function LiftingMachineAppointmentDoc(data, ref) {
    const date = fmtDate(data.appointment_date);

    return (
      <div ref={ref} style={S.page}>

        {/* ── כותרת + לוגו ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', borderBottom: '2.5px solid #ea580c', paddingBottom: 12, marginBottom: 4 }}>
          {/* כותרת — צד ימין (RTL = start) */}
          <div style={{ flex: 1, direction: 'rtl', textAlign: 'right' }}>
            <div style={{ fontFamily: 'Arial', fontSize: 15, fontWeight: 'bold', color: '#111', lineHeight: 1.35 }}>
              מינוי מפעיל מכונת הרמה
            </div>
            <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#6b7280', marginTop: 3, lineHeight: 1.5 }}>
              בהתאם לתקנות הבטיחות בעבודה (עגורנאים, מפעילי מכונות הרמה אחרות ואתתים), התשנ&quot;ג-1992
            </div>
            <div style={{ fontFamily: 'Arial', fontSize: 9, color: '#6b7280', lineHeight: 1.5 }}>
              תוספת חמישית תקנה 18(ג)
            </div>
          </div>
          {/* לוגו — צד שמאל */}
          {data.logoSrc && (
            <img
              src={data.logoSrc}
              alt="לוגו חברה"
              style={{ height: 60, width: 'auto', objectFit: 'contain', marginRight: 'auto', marginLeft: 0, flexShrink: 0 }}
            />
          )}
        </div>

        {/* ── א': פרטי הממנה ── */}
        <SH l="א'" t="פרטי הממנה" />
        <div style={{ padding: '0 6px 2px' }}>
          <Row>
            <F label="שם הממנה" value={data.appointer_name} />
            <F label="תפקיד" value={data.appointer_role} />
          </Row>
          <Row>
            <F label="כתובת" value={data.appointer_address} />
            <F label="מיקוד" value={data.appointer_zip} ltr />
            <F label="טלפון" value={data.appointer_phone} ltr />
          </Row>
        </div>

        {/* ── ב': פרטי מכונת ההרמה ── */}
        <SH l="ב'" t="פרטי מכונת ההרמה" />
        <MachinesTable machines={data.machines} />

        {/* ── ג': פרטי המפעיל ── */}
        <SH l="ג'" t="פרטי המפעיל" />
        <div style={{ padding: '0 6px 2px' }}>
          <Row>
            <F label="שם מלא" value={data.worker_full_name} />
            <F label="שם האב" value={data.worker_father_name} />
          </Row>
          <Row>
            <F label="מספר ת.ז." value={data.worker_id_number} ltr />
            <F label="שנת לידה" value={data.worker_birth_year} ltr />
            <F label="מקצוע" value={data.worker_profession} />
          </Row>
          <Row>
            <F label="כתובת" value={data.worker_address} />
          </Row>
        </div>

        {/* ── ד': הצהרת הממנה ── */}
        <SH l="ד'" t="הצהרת הממנה" />
        <div style={{ padding: '0 6px 6px' }}>
          <div style={S.declarationBox}>
            אני החתום מטה מצהיר בזה כי מיניתי את האדם שפרטיו מפורטים בסעיף (ג) לעיל להפעיל את מכונת ההרמה המתוארת בסעיף ב&apos; לעיל, וכי הוא עומד בכל הדרישות המפורטות בתקנה 18 של תקנות הבטיחות בעבודה (עגורנאים, מפעילי מכונות הרמה אחרות ואתתים), התשנ&quot;ג-1992.
          </div>
          <SigBlock label="חתימת הממנה" name={data.appointer_name} date={date} sig={data.appointer_sig} />
        </div>

        {/* ── ה': הצהרת המפעיל ── */}
        <SH l="ה'" t="הצהרת המפעיל" />
        <div style={{ padding: '0 6px 6px' }}>
          <div style={S.declarationBox}>
            אני מצהיר בזה שכל הנתונים האישיים המפורטים בסעיף (ג) לעיל נכונים וכי קיבלתי הדרכה בהפעלת המכונה המפורטת בסעיף (ב) לעיל כנדרש בתקנה 18 של התקנות הנזכרות בסעיף (ד) לעיל.
          </div>
          <SigBlock label="חתימת המפעיל" name={data.worker_full_name} date={date} sig={data.operator_sig} />
        </div>

        {/* ── פוטר ── */}
        <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 8, textAlign: 'center', fontFamily: 'Arial', fontSize: 9, color: '#9ca3af' }}>
          מסמך זה הופק על ידי מערכת ניהול בטיחות
        </div>
      </div>
    );
  }
);

export default LiftingMachineAppointmentDoc;
