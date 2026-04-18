'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { WorkerWithDocuments, LiftingMachineAppointment, HeavyEquipment, POWER_TYPE_LABELS, PowerType, AppointmentMachine } from '@/types';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import LiftingMachineAppointmentDoc, { AppointmentDocData } from './LiftingMachineAppointmentDoc';

// ─── לוגו קבוע ────────────────────────────────────────────────────────────────
const COMPANY_LOGO_SRC = '/company-logo.png';

// ─── טיפוסים ──────────────────────────────────────────────────────────────────
interface Props {
  worker: WorkerWithDocuments;
  appointments: LiftingMachineAppointment[];
  onAppointmentAdded: (appt: LiftingMachineAppointment) => void;
  onAppointmentDeleted: (id: string) => void;
}

type Step = 1 | 2 | 3 | 4 | 5;
type MachineSource = 'existing' | 'manual';

interface MachineEntry {
  _id: string; // local key only
  source: MachineSource;
  equipment_id: string;
  machine_name: string;
  manufacturer: string;
  machine_identifier: string;
  safe_working_load: string;
  power_type: PowerType | '';
}

interface FormData {
  machines: MachineEntry[];
  // שלב 2 — עובד
  father_name: string;
  birth_year: string;
  profession: string;
  address: string;
  // שלב 3 — ממנה
  appointer_name: string;
  appointer_role: string;
  appointer_phone: string;
  appointer_address: string;
  appointer_zip: string;
  appointment_date: string;
}

let _machineIdCounter = 0;
function newMachineId() { return `m${++_machineIdCounter}`; }

function emptyMachine(): MachineEntry {
  return {
    _id: newMachineId(),
    source: 'existing',
    equipment_id: '',
    machine_name: '',
    manufacturer: '',
    machine_identifier: '',
    safe_working_load: '',
    power_type: '',
  };
}

function initForm(worker: WorkerWithDocuments): FormData {
  return {
    machines: [emptyMachine()],
    father_name: worker.father_name ?? '',
    birth_year: worker.birth_year ? String(worker.birth_year) : '',
    profession: worker.profession ?? '',
    address: worker.address ?? '',
    appointer_name: '',
    appointer_role: '',
    appointer_phone: '',
    appointer_address: '',
    appointer_zip: '',
    appointment_date: new Date().toISOString().split('T')[0],
  };
}

// ─── לוח חתימה ────────────────────────────────────────────────────────────────
interface SignaturePadProps {
  label: string;
  onSave: (dataUrl: string) => void;
  onClear: () => void;
  saved: boolean;
}

function SignaturePad({ label, onSave, onClear, saved }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const hasDrawn = useRef(false);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    hasDrawn.current = false;
    const canvas = canvasRef.current!;
    lastPos.current = getPos(e, canvas);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    hasDrawn.current = true;
  }

  function endDraw() {
    drawing.current = false;
    lastPos.current = null;
    if (hasDrawn.current) {
      onSave(canvasRef.current!.toDataURL('image/png'));
      hasDrawn.current = false;
    }
  }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    onClear();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {saved && <span className="text-xs text-green-600 font-medium">✓ נחתם</span>}
      </div>
      <div className={`border rounded-lg overflow-hidden bg-gray-50 transition-colors ${saved ? 'border-green-400' : 'border-gray-300'}`}>
        <canvas
          ref={canvasRef}
          width={500} height={150}
          className="w-full cursor-crosshair touch-none"
          style={{ height: '120px' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={clearCanvas} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
          נקה
        </button>
      </div>
    </div>
  );
}

// ─── רשומת מינוי קיים ─────────────────────────────────────────────────────────
function AppointmentRow({ appt, onDelete, onViewPdf }: { appt: LiftingMachineAppointment; onDelete: () => void; onViewPdf: () => void }) {
  const dateStr = appt.appointment_date
    ? format(parseISO(appt.appointment_date), 'dd/MM/yyyy', { locale: he })
    : '—';

  const machineCount = appt.machines?.length ?? 1;
  const label = machineCount > 1
    ? `${appt.machine_name} +${machineCount - 1} נוספות`
    : appt.machine_name;

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
        <p className="text-xs text-gray-500">ממנה: {appt.appointer_name} · {dateStr}</p>
      </div>
      <div className="flex gap-2 shrink-0 mr-2">
        {appt.pdf_url ? (
          <button type="button" onClick={onViewPdf} className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100">
            צפה ב-PDF
          </button>
        ) : (
          <span className="text-xs text-gray-400 px-2">מפיק PDF...</span>
        )}
        <button type="button" onClick={onDelete} className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
          מחק
        </button>
      </div>
    </div>
  );
}

// ─── שדה קלט ──────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, ltr = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; ltr?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir={ltr ? 'ltr' : 'rtl'}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm" />
    </div>
  );
}

// ─── טופס מכונה אחת ───────────────────────────────────────────────────────────
function MachineForm({
  entry, index, total, equipment, loadingEq,
  onUpdate, onRemove,
}: {
  entry: MachineEntry;
  index: number;
  total: number;
  equipment: HeavyEquipment[];
  loadingEq: boolean;
  onUpdate: (updates: Partial<MachineEntry>) => void;
  onRemove: () => void;
}) {
  function selectEquipment(eq: HeavyEquipment) {
    onUpdate({
      equipment_id: eq.id,
      machine_name: eq.description,
      manufacturer: eq.manufacturer ?? '',
      machine_identifier: eq.machine_identifier ?? eq.license_number ?? '',
      safe_working_load: eq.safe_working_load ?? '',
      power_type: (eq.power_type as PowerType) ?? '',
    });
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">מכונה {index + 1}</span>
        {total > 1 && (
          <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-0.5">
            הסר
          </button>
        )}
      </div>

      {/* בחירת מקור */}
      <div className="flex gap-2">
        <button type="button" onClick={() => onUpdate({ source: 'existing' })}
          className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${entry.source === 'existing' ? 'bg-orange-50 border-orange-400 text-orange-700 font-medium' : 'border-gray-300 text-gray-600'}`}>
          כלי קיים
        </button>
        <button type="button" onClick={() => onUpdate({ source: 'manual', equipment_id: '' })}
          className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${entry.source === 'manual' ? 'bg-orange-50 border-orange-400 text-orange-700 font-medium' : 'border-gray-300 text-gray-600'}`}>
          הזנה ידנית
        </button>
      </div>

      {/* בחירת כלי קיים */}
      {entry.source === 'existing' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">בחר כלי צמ&quot;ה</label>
          {loadingEq ? (
            <p className="text-sm text-gray-400">טוען כלים...</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white">
              {equipment.length === 0 && <p className="text-sm text-gray-400 p-2">אין כלים פעילים</p>}
              {equipment.map((eq) => (
                <button key={eq.id} type="button" onClick={() => selectEquipment(eq)}
                  className={`w-full text-right px-3 py-2 text-sm rounded-lg transition-colors ${entry.equipment_id === eq.id ? 'bg-orange-100 text-orange-800 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}>
                  {eq.description}
                  {eq.manufacturer && <span className="text-gray-400 mr-1">· {eq.manufacturer}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* שדות מכונה */}
      <Field label="שם המכונה *" value={entry.machine_name} onChange={(v) => onUpdate({ machine_name: v })} placeholder="למשל: מנוף טאדאנו" />
      <Field label="יצרן" value={entry.manufacturer} onChange={(v) => onUpdate({ manufacturer: v })} />
      <Field label="מספר מזהה" value={entry.machine_identifier} onChange={(v) => onUpdate({ machine_identifier: v })} ltr />
      <Field label="עומס עבודה בטוח" value={entry.safe_working_load} onChange={(v) => onUpdate({ safe_working_load: v })} placeholder="למשל: 5 טון" />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">סוג הפעלה</label>
        <select value={entry.power_type} onChange={(e) => onUpdate({ power_type: e.target.value as PowerType | '' })}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white text-sm">
          <option value="">— בחר —</option>
          {(Object.entries(POWER_TYPE_LABELS) as [PowerType, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── מרכיב ראשי ───────────────────────────────────────────────────────────────
export default function LiftingMachineAppointmentCard({
  worker, appointments, onAppointmentAdded, onAppointmentDeleted,
}: Props) {
  const [localAppts, setLocalAppts] = useState<LiftingMachineAppointment[]>(appointments);
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(() => initForm(worker));
  const [equipment, setEquipment] = useState<HeavyEquipment[]>([]);
  const [loadingEq, setLoadingEq] = useState(false);
  const [operatorSig, setOperatorSig] = useState<string | null>(null);
  const [appointerSig, setAppointerSig] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  const overlayRef = useRef<HTMLDivElement>(null);
  const [overlayData, setOverlayData] = useState<AppointmentDocData | null>(null);
  const [apptIdForPdf, setApptIdForPdf] = useState<string | null>(null);
  const [pdfGenError, setPdfGenError] = useState<string | null>(null);

  const fetchEquipment = useCallback(async () => {
    if (equipment.length > 0) return;
    setLoadingEq(true);
    try {
      const res = await fetch('/api/heavy-equipment');
      const data = await res.json();
      if (Array.isArray(data)) setEquipment(data.filter((e: HeavyEquipment) => e.is_active));
    } finally { setLoadingEq(false); }
  }, [equipment.length]);

  useEffect(() => {
    if (showForm && step === 1) fetchEquipment();
  }, [showForm, step, fetchEquipment]);

  // ── helpers ──────────────────────────────────────────────────────────────────
  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateMachine(index: number, updates: Partial<MachineEntry>) {
    setForm((prev) => {
      const machines = [...prev.machines];
      machines[index] = { ...machines[index], ...updates };
      return { ...prev, machines };
    });
  }

  function addMachine() {
    setForm((prev) => ({ ...prev, machines: [...prev.machines, emptyMachine()] }));
  }

  function removeMachine(index: number) {
    setForm((prev) => ({
      ...prev,
      machines: prev.machines.filter((_, i) => i !== index),
    }));
  }

  function openForm() {
    setForm(initForm(worker));
    setOperatorSig(null);
    setAppointerSig(null);
    setStep(1);
    setError('');
    setSaveStatus('');
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); }

  function next() {
    setError('');
    if (step === 1) {
      const nameMissing = form.machines.some((m) => !m.machine_name.trim());
      if (nameMissing) { setError('יש להזין שם לכל מכונה'); return; }
    }
    if (step === 3 && !form.appointer_name.trim()) { setError('שם הממנה נדרש'); return; }
    if (step === 4 && !appointerSig) { setError('יש לחתום את חתימת הממנה לפני המשך'); return; }
    setStep((s) => (s < 5 ? (s + 1) as Step : s));
  }

  async function handleSubmit() {
    if (!appointerSig || !operatorSig) {
      setError('יש להשלים חתימת ממנה וחתימת מפעיל לפני הפקת PDF');
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      setSaveStatus('שומר...');
      const machines: AppointmentMachine[] = form.machines.map((m) => ({
        equipment_id: m.equipment_id || null,
        machine_name: m.machine_name,
        manufacturer: m.manufacturer || undefined,
        machine_identifier: m.machine_identifier || undefined,
        safe_working_load: m.safe_working_load || undefined,
        power_type: m.power_type || undefined,
      }));

      const firstMachine = form.machines[0];

      const res = await fetch('/api/lifting-machine-appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: worker.id,
          // שדות מכונה ראשונה — backward compat לתצוגת הרשימה
          equipment_id: firstMachine.equipment_id || null,
          machine_name: firstMachine.machine_name,
          manufacturer: firstMachine.manufacturer,
          machine_identifier: firstMachine.machine_identifier,
          safe_working_load: firstMachine.safe_working_load,
          power_type: firstMachine.power_type || null,
          // מערך מלא של מכונות
          machines,
          // ממנה
          appointer_name: form.appointer_name,
          appointer_role: form.appointer_role,
          appointer_phone: form.appointer_phone,
          appointer_address: form.appointer_address,
          appointer_zip: form.appointer_zip,
          appointment_date: form.appointment_date,
          // שדות עובד
          worker_father_name: form.father_name,
          worker_birth_year: form.birth_year,
          worker_profession: form.profession,
          worker_address: form.address,
          // חתימות
          operator_signature_b64: operatorSig,
          appointer_signature_b64: appointerSig,
          worker_full_name: worker.full_name,
          worker_id_number: worker.id_number,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה בשמירה'); return; }

      setLocalAppts((prev) => [data, ...prev]);
      onAppointmentAdded(data);
      closeForm();

      setOverlayData({
        appointer_name: form.appointer_name,
        appointer_address: form.appointer_address,
        appointer_zip: form.appointer_zip,
        appointer_phone: form.appointer_phone,
        appointer_role: form.appointer_role,
        machines,
        worker_full_name: worker.full_name,
        worker_id_number: worker.id_number,
        worker_father_name: form.father_name,
        worker_birth_year: form.birth_year,
        worker_profession: form.profession,
        worker_address: form.address,
        appointment_date: form.appointment_date,
        appointer_sig: appointerSig,
        operator_sig: operatorSig,
        logoSrc: COMPANY_LOGO_SRC,
      });
      setApptIdForPdf(data.id);
    } catch {
      setError('שגיאת תקשורת — נסה שנית');
    } finally {
      setSubmitting(false);
      setSaveStatus('');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('למחוק מינוי זה? הפעולה בלתי הפיכה.')) return;
    const res = await fetch(`/api/lifting-machine-appointments/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setLocalAppts((prev) => prev.filter((a) => a.id !== id));
      onAppointmentDeleted(id);
    }
  }

  async function handleViewPdf(appt: LiftingMachineAppointment) {
    if (!appt.pdf_url) return;
    const res = await fetch(`/api/signed-url?path=${encodeURIComponent(appt.pdf_url)}`);
    const data = await res.json();
    if (data.url) window.open(data.url, '_blank');
  }

  // ── html2canvas PDF generation ────────────────────────────────────────────────
  useEffect(() => {
    if (!overlayData || !apptIdForPdf) return;
    let cancelled = false;
    const apptId = apptIdForPdf;

    async function capture() {
      try {
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        if (cancelled) return;

        const el = overlayRef.current;
        if (!el) throw new Error('ה-overlay לא נמצא ב-DOM');
        if (el.offsetWidth === 0 || el.offsetHeight === 0) throw new Error('overlay גודל אפס');

        const { default: html2canvas } = await import('html2canvas');
        const canvas = await html2canvas(el, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false,
          width: 595,
          x: 0,
          y: 0,
          onclone: (_clonedDoc: Document) => {
            _clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach((s) => s.remove());
          },
        });
        if (cancelled) return;

        const overlayImageB64 = canvas.toDataURL('image/png');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20_000);
        let res: Response;
        try {
          res = await fetch('/api/lifting-machine-appointments/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appointment_id: apptId, overlay_image_b64: overlayImageB64 }),
            signal: controller.signal,
          });
        } finally { clearTimeout(timeoutId); }

        if (res.ok) {
          const { pdf_url } = await res.json() as { pdf_url: string };
          setLocalAppts((prev) => prev.map((a) => (a.id === apptId ? { ...a, pdf_url } : a)));
        } else {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(`שגיאת שרת (${res.status}): ${(errBody as { error?: string }).error ?? 'לא ידוע'}`);
        }
      } catch (err) {
        setPdfGenError(err instanceof Error ? err.message : 'שגיאה לא ידועה בהפקת PDF');
      } finally {
        setOverlayData(null);
        setApptIdForPdf(null);
      }
    }

    capture();
    return () => { cancelled = true; };
  }, [overlayData, apptIdForPdf]);

  // ── STEP labels ───────────────────────────────────────────────────────────────
  const STEP_LABELS: Record<Step, string> = { 1: 'מכונות', 2: 'מפעיל', 3: 'ממנה', 4: 'הצהרת ממנה', 5: 'הצהרת מפעיל' };
  const DECLARATION_APPOINTER = 'אני החתום מטה מצהיר בזה כי מיניתי את האדם שפרטיו מפורטים בסעיף (ג) לעיל להפעיל את מכונת ההרמה המתוארת בסעיף ב\' לעיל, וכי הוא עומד בכל הדרישות המפורטות בתקנה 18 של תקנות הבטיחות בעבודה (עגורנאים, מפעילי מכונות הרמה אחרות ואתתים), התשנ"ג-1992.';
  const DECLARATION_OPERATOR = 'אני מצהיר בזה שכל הנתונים האישיים המפורטים בסעיף (ג) לעיל נכונים וכי קיבלתי הדרכה בהפעלת המכונה המפורטת בסעיף (ב) לעיל כנדרש בתקנה 18 של התקנות הנזכרות בסעיף (ד) לעיל.';

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900">מינוי מפעיל מכונת הרמה</h3>
        <button type="button" onClick={openForm}
          className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">
          + מינוי חדש
        </button>
      </div>

      {localAppts.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">אין מינויים עדיין</p>
      ) : (
        <div className="space-y-2">
          {localAppts.map((a) => (
            <AppointmentRow key={a.id} appt={a} onDelete={() => handleDelete(a.id)} onViewPdf={() => handleViewPdf(a)} />
          ))}
        </div>
      )}

      {/* Overlay off-screen לצורך html2canvas */}
      {overlayData && (
        <div style={{ position: 'absolute', top: 0, left: -9999, width: 595, height: 'auto', overflow: 'visible', pointerEvents: 'none', zIndex: -1 }}>
          <LiftingMachineAppointmentDoc ref={overlayRef} {...overlayData} />
        </div>
      )}

      {/* שגיאת הפקת PDF */}
      {pdfGenError && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>שגיאה בהפקת PDF: {pdfGenError}</span>
          <button type="button" onClick={() => setPdfGenError(null)} className="text-red-400 hover:text-red-600 ml-2">×</button>
        </div>
      )}

      {/* Modal טופס */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeForm} />
          <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
            {/* כותרת */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
              <h2 className="text-lg font-bold text-gray-900">מינוי מפעיל מכונת הרמה</h2>
              <button type="button" onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            {/* אינדיקטור שלבים */}
            <div className="flex px-5 py-3 gap-1 shrink-0">
              {([1, 2, 3, 4, 5] as Step[]).map((s) => (
                <div key={s} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`h-1.5 w-full rounded-full transition-colors ${step >= s ? 'bg-orange-500' : 'bg-gray-200'}`} />
                  <span className={`text-xs leading-tight text-center ${step === s ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
                    {STEP_LABELS[s]}
                  </span>
                </div>
              ))}
            </div>

            {/* תוכן */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* ── שלב 1: מכונות ── */}
              {step === 1 && (
                <>
                  <div className="space-y-4">
                    {form.machines.map((entry, i) => (
                      <MachineForm
                        key={entry._id}
                        entry={entry}
                        index={i}
                        total={form.machines.length}
                        equipment={equipment}
                        loadingEq={loadingEq}
                        onUpdate={(u) => updateMachine(i, u)}
                        onRemove={() => removeMachine(i)}
                      />
                    ))}
                  </div>
                  <button type="button" onClick={addMachine}
                    className="w-full py-2.5 border-2 border-dashed border-orange-300 text-orange-600 text-sm rounded-xl hover:bg-orange-50 transition-colors">
                    + הוסף מכונה
                  </button>
                </>
              )}

              {/* ── שלב 2: מפעיל ── */}
              {step === 2 && (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
                    הפרטים הבאים יופיעו במסמך המינוי. שינויים ישמרו בפרופיל העובד.
                  </div>
                  <p className="text-sm font-medium text-gray-500">שם מלא: <span className="text-gray-900">{worker.full_name}</span></p>
                  <p className="text-sm font-medium text-gray-500">ת.ז.: <span className="text-gray-900">{worker.id_number}</span></p>
                  <Field label="שם האב" value={form.father_name} onChange={(v) => setField('father_name', v)} />
                  <Field label="שנת לידה" value={form.birth_year} onChange={(v) => setField('birth_year', v)} ltr placeholder="1985" />
                  <Field label="מקצוע" value={form.profession} onChange={(v) => setField('profession', v)} placeholder="מפעיל מנוף" />
                  <Field label="כתובת" value={form.address} onChange={(v) => setField('address', v)} />
                </>
              )}

              {/* ── שלב 3: ממנה ── */}
              {step === 3 && (
                <>
                  <Field label="שם הממנה *" value={form.appointer_name} onChange={(v) => setField('appointer_name', v)} placeholder="תופש המפעל / מבצע הבניה" />
                  <Field label="תפקיד" value={form.appointer_role} onChange={(v) => setField('appointer_role', v)} />
                  <Field label="כתובת" value={form.appointer_address} onChange={(v) => setField('appointer_address', v)} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="מיקוד" value={form.appointer_zip} onChange={(v) => setField('appointer_zip', v)} ltr />
                    <Field label="טלפון" value={form.appointer_phone} onChange={(v) => setField('appointer_phone', v)} ltr />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">תאריך מינוי</label>
                    <input type="date" value={form.appointment_date} onChange={(e) => setField('appointment_date', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm" dir="ltr" />
                  </div>
                </>
              )}

              {/* ── שלב 4: הצהרת הממנה + חתימה ── */}
              {step === 4 && (
                <>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-orange-800 mb-2">הצהרת הממנה</h3>
                    <p className="text-sm text-gray-700 leading-relaxed">{DECLARATION_APPOINTER}</p>
                  </div>
                  <div className="pt-1 space-y-2">
                    <div className="flex gap-4 text-sm text-gray-600">
                      <span>שם הממנה: <strong>{form.appointer_name}</strong></span>
                      <span>תאריך: <strong dir="ltr">{form.appointment_date.split('-').reverse().join('/')}</strong></span>
                    </div>
                    <SignaturePad
                      label="חתימת הממנה"
                      onSave={(url) => setAppointerSig(url)}
                      onClear={() => setAppointerSig(null)}
                      saved={!!appointerSig}
                    />
                    {!appointerSig && (
                      <p className="text-xs text-orange-600">יש לחתום לפני המשך</p>
                    )}
                  </div>
                </>
              )}

              {/* ── שלב 5: הצהרת המפעיל + חתימה ── */}
              {step === 5 && (
                <>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-orange-800 mb-2">הצהרת המפעיל</h3>
                    <p className="text-sm text-gray-700 leading-relaxed">{DECLARATION_OPERATOR}</p>
                  </div>
                  <div className="pt-1 space-y-2">
                    <div className="flex gap-4 text-sm text-gray-600">
                      <span>שם המפעיל: <strong>{worker.full_name}</strong></span>
                      <span>תאריך: <strong dir="ltr">{form.appointment_date.split('-').reverse().join('/')}</strong></span>
                    </div>
                    <SignaturePad
                      label="חתימת המפעיל"
                      onSave={(url) => setOperatorSig(url)}
                      onClear={() => setOperatorSig(null)}
                      saved={!!operatorSig}
                    />
                    {!operatorSig && (
                      <p className="text-xs text-orange-600">יש לחתום לפני שמירה</p>
                    )}
                  </div>
                </>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* כפתורים */}
            <div className="flex gap-3 px-5 py-4 border-t border-gray-200 shrink-0">
              {step > 1 && (
                <button type="button" onClick={() => { setError(''); setStep((s) => (s - 1) as Step); }}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  ← חזרה
                </button>
              )}
              <div className="flex-1" />
              {step < 5 ? (
                <button type="button" onClick={next}
                  className="px-6 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600">
                  המשך →
                </button>
              ) : (
                <button type="button" onClick={handleSubmit}
                  disabled={submitting || !appointerSig || !operatorSig}
                  title={!appointerSig || !operatorSig ? 'יש להשלים חתימת ממנה וחתימת מפעיל לפני הפקת PDF' : undefined}
                  className="px-6 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
                  {submitting ? (saveStatus || 'שומר...') : 'שמור והפק PDF'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
