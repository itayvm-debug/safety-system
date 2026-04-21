'use client';

import { useState } from 'react';
import type { WorkerWithDocuments, HeavyEquipment, DocumentStatus } from '@/types';
import { getWorkerStatus, getHeavyEquipmentStatus } from '@/lib/documents/status';
import { getEffectiveSubcontractor } from '@/lib/workers/subcontractor';
import { buildWorkersHtml, buildEquipmentHtml, generatePdf } from '@/lib/export/generatePdf';
import { generateWorkersExcel, generateEquipmentExcel } from '@/lib/export/generateExcel';

type ReportType = 'workers' | 'equipment' | 'combined';
type Format = 'pdf' | 'excel';

interface Filters {
  status: DocumentStatus | 'all';
  subcontractor_id: string;
  manager_id: string;
  search: string;
  show_inactive: boolean;
}

interface Props {
  onClose: () => void;
}

const STEP_LABELS = ['סוג דוח', 'סינונים', 'פורמט'];

export default function ExportWizard({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const [reportType, setReportType] = useState<ReportType>('workers');
  const [filters, setFilters] = useState<Filters>({
    status: 'all',
    subcontractor_id: '',
    manager_id: '',
    search: '',
    show_inactive: true,
  });
  const [format, setFormat] = useState<Format>('pdf');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [subcontractors, setSubcontractors] = useState<{ id: string; name: string }[]>([]);
  const [managers, setManagers] = useState<{ id: string; full_name: string }[]>([]);

  // טוען נתוני סינון כשמגיעים לשלב 2
  async function loadFilterData() {
    try {
      const [subRes, manRes] = await Promise.all([
        fetch('/api/subcontractors'),
        fetch('/api/workers?managers=true'),
      ]);
      const [subs, mans] = await Promise.all([subRes.json(), manRes.json()]);
      if (Array.isArray(subs)) setSubcontractors(subs);
      if (Array.isArray(mans)) setManagers(mans);
    } catch { /* silently ignore */ }
  }

  function handleNext() {
    if (step === 0) loadFilterData();
    setStep((s) => s + 1);
  }

  async function handleGenerate() {
    setLoading(true);
    setError('');

    try {
      const today = new Date().toLocaleDateString('he-IL').replace(/\//g, '-');

      if (reportType === 'workers' || reportType === 'combined') {
        const res = await fetch('/api/workers');
        if (!res.ok) throw new Error('שגיאה בטעינת עובדים');
        const raw: WorkerWithDocuments[] = await res.json();

        const workersById = new Map(raw.map((w) => [w.id, w]));

        const workers = raw.filter((w) => {
          if (!filters.show_inactive && !w.is_active) return false;
          if (filters.search && !w.full_name.includes(filters.search) &&
            !(w.national_id ?? '').includes(filters.search) &&
            !(w.passport_number ?? '').includes(filters.search)) return false;
          if (filters.status !== 'all' && getWorkerStatus(w) !== filters.status) return false;
          if (filters.manager_id && w.responsible_manager_id !== filters.manager_id) return false;
          if (filters.subcontractor_id) {
            const eff = getEffectiveSubcontractor(w, workersById as Map<string, Parameters<typeof getEffectiveSubcontractor>[0]>);
            if (eff?.id !== filters.subcontractor_id) return false;
          }
          return true;
        });

        if (reportType === 'workers' || reportType === 'combined') {
          const title = 'דוח עובדים';
          if (format === 'excel') {
            generateWorkersExcel(workers);
          } else {
            const html = buildWorkersHtml(workers, title);
            await generatePdf(html, `עובדים_${today}.pdf`);
          }
        }
      }

      if (reportType === 'equipment' || reportType === 'combined') {
        const res = await fetch('/api/heavy-equipment');
        if (!res.ok) throw new Error('שגיאה בטעינת ציוד');
        const raw: HeavyEquipment[] = await res.json();

        const equipment = raw.filter((eq) => {
          if (!filters.show_inactive && !eq.is_active) return false;
          if (filters.search && !eq.description.includes(filters.search) &&
            !(eq.license_number ?? '').includes(filters.search)) return false;
          if (filters.status !== 'all' && getHeavyEquipmentStatus(eq) !== filters.status) return false;
          if (filters.subcontractor_id && eq.subcontractor_id !== filters.subcontractor_id) return false;
          return true;
        });

        const title = 'דוח כלי צמ"ה';
        if (format === 'excel') {
          generateEquipmentExcel(equipment);
        } else {
          const html = buildEquipmentHtml(equipment, title);
          await generatePdf(html, `כלי_צמה_${today}.pdf`);
        }
      }

      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה ביצוא');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* כותרת + סגירה */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">יצוא נתונים</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-50">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                i < step ? 'bg-orange-500 text-white' :
                i === step ? 'bg-orange-100 text-orange-600 ring-2 ring-orange-400' :
                'bg-gray-100 text-gray-400'
              }`}>{i + 1}</div>
              <span className={`text-sm ${i === step ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{label}</span>
              {i < 2 && <div className="w-8 h-px bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>

        {/* תוכן */}
        <div className="p-6 space-y-4 min-h-[240px]">
          {/* שלב 0 – סוג דוח */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 font-medium">בחר את סוג הדוח לייצוא:</p>
              {([
                { value: 'workers', label: 'עובדים', desc: 'פרטי עובדים וסטטוס מסמכים' },
                { value: 'equipment', label: 'כלי צמ"ה', desc: 'ציוד כבד, רישיונות וביטוחים' },
                { value: 'combined', label: 'משולב', desc: 'עובדים + כלי צמ"ה יחד (2 קבצים)' },
              ] as { value: ReportType; label: string; desc: string }[]).map(({ value, label, desc }) => (
                <label key={value} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  reportType === value ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="reportType" value={value} checked={reportType === value}
                    onChange={() => setReportType(value)} className="mt-0.5 accent-orange-500" />
                  <div>
                    <p className="font-medium text-gray-900">{label}</p>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* שלב 1 – סינונים */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 font-medium">הגדר סינונים (אופציונלי):</p>

              <div>
                <label className="block text-xs text-gray-500 mb-1">חיפוש טקסט</label>
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  placeholder="שם, מספר מזהה..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">סטטוס</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters['status'] }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <option value="all">כל הסטטוסים</option>
                  <option value="expired">לא תקין / פג תוקף</option>
                  <option value="expiring_soon">עומד לפוג</option>
                  <option value="valid">תקין</option>
                  <option value="missing">חסר</option>
                </select>
              </div>

              {(reportType === 'workers' || reportType === 'combined') && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">קבלן משנה</label>
                    <select
                      value={filters.subcontractor_id}
                      onChange={(e) => setFilters((f) => ({ ...f, subcontractor_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                    >
                      <option value="">כל הקבלנים</option>
                      {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">מנהל עבודה</label>
                    <select
                      value={filters.manager_id}
                      onChange={(e) => setFilters((f) => ({ ...f, manager_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                    >
                      <option value="">כל מנהלי העבודה</option>
                      {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </select>
                  </div>
                </>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.show_inactive}
                  onChange={(e) => setFilters((f) => ({ ...f, show_inactive: e.target.checked }))}
                  className="accent-orange-500"
                />
                <span className="text-sm text-gray-700">כלול רשומות לא פעילות</span>
              </label>
            </div>
          )}

          {/* שלב 2 – פורמט */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 font-medium">בחר פורמט יצוא:</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'pdf', label: 'PDF', desc: 'דוח מעוצב עם לוגו' },
                  { value: 'excel', label: 'Excel', desc: 'גיליון נתונים ערכאי' },
                ] as { value: Format; label: string; desc: string }[]).map(({ value, label, desc }) => (
                  <label key={value} className={`flex flex-col items-center p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                    format === value ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input type="radio" name="format" value={value} checked={format === value}
                      onChange={() => setFormat(value)} className="sr-only" />
                    <span className="text-2xl mb-1">{value === 'pdf' ? '📄' : '📊'}</span>
                    <span className="font-bold text-gray-900">{label}</span>
                    <span className="text-xs text-gray-500 text-center mt-0.5">{desc}</span>
                  </label>
                ))}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* כפתורים */}
        <div className="flex gap-3 p-6 border-t border-gray-100">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              הקודם
            </button>
          )}
          <div className="flex-1" />
          {step < 2 ? (
            <button
              onClick={handleNext}
              className="px-5 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
            >
              הבא
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="px-5 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'מייצא...' : `יצוא ${format === 'pdf' ? 'PDF' : 'Excel'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
