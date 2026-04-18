'use client';

import React from 'react';
import { POWER_TYPE_LABELS, PowerType } from '@/types';

// ─── טיפוס הנתונים ────────────────────────────────────────────────────────────
export interface AppointmentDocData {
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
  appointment_date: string; // YYYY-MM-DD
  appointer_sig?: string | null;
  operator_sig?: string | null;
}

// ─── עזרים ────────────────────────────────────────────────────────────────────
function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d ? `${d}/${m}/${y}` : iso;
}

// ─── כותרת סעיף ───────────────────────────────────────────────────────────────
function SectionHeader({ letter, title }: { letter: string; title: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#ea580c',
      borderRadius: 3,
      padding: '4px 10px',
      marginBottom: 8,
      marginTop: 12,
    }}>
      <span style={{ fontFamily: 'Arial', fontSize: 11, fontWeight: 'bold', color: '#fff' }}>{letter}</span>
      <span style={{ fontFamily: 'Arial', fontSize: 11, color: '#fff' }}>{title}</span>
    </div>
  );
}

// ─── שדה עם קו תחתון ──────────────────────────────────────────────────────────
function LabeledField({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flex: 1 }}>
      <span style={{ fontFamily: 'Arial', fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' }}>{label}:</span>
      <span style={{
        flex: 1,
        borderBottom: '1px solid #9ca3af',
        fontFamily: 'Arial',
        fontSize: 11,
        color: '#111',
        paddingBottom: 1,
        direction: ltr ? 'ltr' : 'rtl',
        textAlign: ltr ? 'left' : 'right',
        minWidth: 40,
      }}>
        {value || '\u00a0'}
      </span>
    </div>
  );
}

// ─── שורת שדות ────────────────────────────────────────────────────────────────
function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 6, direction: 'rtl' }}>
      {children}
    </div>
  );
}

// ─── בלוק הצהרה ───────────────────────────────────────────────────────────────
function DeclarationBox({ text }: { text: string }) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: 4,
      padding: '8px 10px',
      backgroundColor: '#f9fafb',
      marginBottom: 10,
      fontFamily: 'Arial',
      fontSize: 10.5,
      color: '#374151',
      lineHeight: 1.7,
      direction: 'rtl',
      textAlign: 'right',
    }}>
      {text}
    </div>
  );
}

// ─── בלוק חתימה ───────────────────────────────────────────────────────────────
function SignatureBlock({
  label,
  name,
  date,
  sigDataUrl,
}: {
  label: string;
  name: string;
  date: string;
  sigDataUrl?: string | null;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, direction: 'rtl', alignItems: 'flex-end' }}>
      {/* חתימה */}
      <div style={{ flex: 1.2 }}>
        <div style={{ fontFamily: 'Arial', fontSize: 10, color: '#6b7280', marginBottom: 3 }}>{label}:</div>
        {sigDataUrl ? (
          <img
            src={sigDataUrl}
            alt={label}
            style={{ width: '100%', height: 48, objectFit: 'contain', display: 'block', borderBottom: '1px solid #374151' }}
          />
        ) : (
          <div style={{ height: 48, borderBottom: '1px solid #374151' }} />
        )}
      </div>
      {/* שם */}
      <div style={{ flex: 1.5 }}>
        <div style={{ fontFamily: 'Arial', fontSize: 10, color: '#6b7280', marginBottom: 3 }}>שם:</div>
        <div style={{
          height: 48,
          borderBottom: '1px solid #374151',
          fontFamily: 'Arial',
          fontSize: 11,
          color: '#111',
          paddingTop: 4,
          direction: 'rtl',
        }}>
          {name}
        </div>
      </div>
      {/* תאריך */}
      <div style={{ flex: 0.8 }}>
        <div style={{ fontFamily: 'Arial', fontSize: 10, color: '#6b7280', marginBottom: 3 }}>תאריך:</div>
        <div style={{
          height: 48,
          borderBottom: '1px solid #374151',
          fontFamily: 'Arial',
          fontSize: 11,
          color: '#111',
          paddingTop: 4,
          direction: 'ltr',
          textAlign: 'left',
        }}>
          {date}
        </div>
      </div>
    </div>
  );
}

// ─── מסמך מינוי מפעיל מכונת הרמה ─────────────────────────────────────────────
const LiftingMachineAppointmentDoc = React.forwardRef<HTMLDivElement, AppointmentDocData>(
  function LiftingMachineAppointmentDoc(data, ref) {
    const powerLabel = data.power_type
      ? (POWER_TYPE_LABELS[data.power_type as PowerType] ?? data.power_type)
      : '';

    return (
      <div
        ref={ref}
        dir="rtl"
        style={{
          width: 595,
          backgroundColor: '#ffffff',
          padding: '28px 32px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          boxSizing: 'border-box',
          direction: 'rtl',
        }}
      >
        {/* ── כותרת ── */}
        <div style={{ textAlign: 'center', borderBottom: '2.5px solid #ea580c', paddingBottom: 12, marginBottom: 4 }}>
          <div style={{ fontFamily: 'Arial', fontSize: 19, fontWeight: 'bold', color: '#111', letterSpacing: 0.5 }}>
            מינוי מפעיל מכונת הרמה
          </div>
          <div style={{ fontFamily: 'Arial', fontSize: 9.5, color: '#6b7280', marginTop: 4 }}>
            בהתאם לתקנות הבטיחות בעבודה (עגורנאים, מפעילי מנופים וקרנות הרמה), התשכ&quot;ו-1966
          </div>
        </div>

        {/* ── חלק א': פרטי הממנה ── */}
        <SectionHeader letter="א'" title="פרטי הממנה" />
        <div style={{ padding: '0 6px 2px' }}>
          <FieldRow>
            <LabeledField label="שם הממנה" value={data.appointer_name} />
            <LabeledField label="תפקיד" value={data.appointer_role} />
          </FieldRow>
          <FieldRow>
            <LabeledField label="כתובת" value={data.appointer_address} />
            <LabeledField label="מיקוד" value={data.appointer_zip} ltr />
            <LabeledField label="טלפון" value={data.appointer_phone} ltr />
          </FieldRow>
        </div>

        {/* ── חלק ב': פרטי מכונת ההרמה ── */}
        <SectionHeader letter="ב'" title="פרטי מכונת ההרמה" />
        <div style={{ padding: '0 6px 2px' }}>
          <FieldRow>
            <LabeledField label="שם המכונה" value={data.machine_name} />
            <LabeledField label="יצרן" value={data.manufacturer} />
          </FieldRow>
          <FieldRow>
            <LabeledField label="מספר מזהה" value={data.machine_identifier} ltr />
            <LabeledField label="עומס עבודה בטוח" value={data.safe_working_load} />
            <LabeledField label="סוג הפעלה" value={powerLabel} />
          </FieldRow>
        </div>

        {/* ── חלק ג': פרטי המפעיל ── */}
        <SectionHeader letter="ג'" title="פרטי המפעיל" />
        <div style={{ padding: '0 6px 2px' }}>
          <FieldRow>
            <LabeledField label="שם מלא" value={data.worker_full_name} />
            <LabeledField label="שם האב" value={data.worker_father_name} />
          </FieldRow>
          <FieldRow>
            <LabeledField label="מספר ת.ז." value={data.worker_id_number} ltr />
            <LabeledField label="שנת לידה" value={data.worker_birth_year} ltr />
            <LabeledField label="מקצוע" value={data.worker_profession} />
          </FieldRow>
          <FieldRow>
            <LabeledField label="כתובת" value={data.worker_address} />
          </FieldRow>
        </div>

        {/* ── חלק ד': הצהרת הממנה ── */}
        <SectionHeader letter="ד'" title="הצהרת הממנה" />
        <div style={{ padding: '0 6px 2px' }}>
          <DeclarationBox text="אני החתום מטה מצהיר בזה כי מיניתי את האדם שפרטיו מפורטים לעיל להפעיל את מכונת ההרמה המתוארת לעיל, וכי למיטב ידיעתי הוא עומד בדרישות הנדרשות לצורך הפעלתה." />
          <SignatureBlock
            label="חתימת הממנה"
            name={data.appointer_name}
            date={fmtDate(data.appointment_date)}
            sigDataUrl={data.appointer_sig}
          />
        </div>

        {/* ── חלק ה': הצהרת המפעיל ── */}
        <SectionHeader letter="ה'" title="הצהרת המפעיל" />
        <div style={{ padding: '0 6px 2px' }}>
          <DeclarationBox text="אני מצהיר בזה כי הפרטים האישיים המפורטים לעיל נכונים, וכי קיבלתי הדרכה מתאימה להפעלת מכונת ההרמה המתוארת במסמך זה." />
          <SignatureBlock
            label="חתימת המפעיל"
            name={data.worker_full_name}
            date={fmtDate(data.appointment_date)}
            sigDataUrl={data.operator_sig}
          />
        </div>

        {/* ── פוטר ── */}
        <div style={{
          marginTop: 20,
          borderTop: '1px solid #e5e7eb',
          paddingTop: 8,
          textAlign: 'center',
          fontFamily: 'Arial',
          fontSize: 9,
          color: '#9ca3af',
        }}>
          מסמך זה הופק על ידי מערכת ניהול בטיחות
        </div>
      </div>
    );
  }
);

export default LiftingMachineAppointmentDoc;
