'use client';

import { useState } from 'react';
import type { WorkerWithDocuments, Vehicle, HeavyEquipment, LiftingEquipment } from '@/types';
import { getWorkerStatus, getVehicleStatus, getHeavyEquipmentStatus } from '@/lib/documents/status';
import { getEffectiveSubcontractor } from '@/lib/workers/subcontractor';
import { buildAllIssues, type Issue } from '@/lib/documents/issues';
import {
  generateWorkersExcel,
  generateVehiclesExcel,
  generateEquipmentExcel,
  generateIssuesExcel,
} from '@/lib/export/generateExcel';
import {
  buildWorkersHtml,
  buildVehiclesHtml,
  buildEquipmentHtml,
  buildIssuesHtml,
  generatePdf,
} from '@/lib/export/generatePdf';

// ─── Types ────────────────────────────────────────────────────
type ReportType = 'workers' | 'managers' | 'vehicles' | 'equipment' | 'issues';
type ExportFormat = 'excel' | 'pdf';

interface Filters {
  status: 'all' | 'urgent' | 'expiring_soon';
  subcontractor_id: string;
  manager_id: string;
  search: string;
  show_inactive: boolean;
  entity_type: 'all' | 'worker' | 'vehicle' | 'heavy_equipment' | 'lifting_equipment';
}

const REPORT_OPTIONS: { value: ReportType; label: string; desc: string; icon: string }[] = [
  { value: 'workers',   label: 'עובדים',        desc: 'כל העובדים, פרטים וסטטוס מסמכים',   icon: '👷' },
  { value: 'managers',  label: 'מנהלי עבודה',   desc: 'מנהלי עבודה פנימיים בלבד',           icon: '🦺' },
  { value: 'vehicles',  label: 'רכבים',          desc: 'רכבים, רישיונות וביטוחים',           icon: '🚗' },
  { value: 'equipment', label: 'כלי צמ"ה',       desc: 'ציוד כבד, רישיונות ותסקירים',        icon: '🏗️' },
  { value: 'issues',    label: 'דורש טיפול',     desc: 'ליקויים פעילים מכל הישויות',         icon: '⚠️' },
];

const STEP_LABELS = ['סוג דוח', 'פורמט', 'סינונים', 'צור דוח'];

interface Props {
  onClose: () => void;
}

export default function ExportWizard({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const [reportType, setReportType] = useState<ReportType>('workers');
  const [format, setFormat] = useState<ExportFormat>('excel');
  const [filters, setFilters] = useState<Filters>({
    status: 'all',
    subcontractor_id: '',
    manager_id: '',
    search: '',
    show_inactive: true,
    entity_type: 'all',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const [subcontractors, setSubcontractors] = useState<{ id: string; name: string }[]>([]);
  const [managers, setManagers] = useState<{ id: string; full_name: string }[]>([]);

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

  function goNext() {
    if (step === 1) loadFilterData();
    setStep((s) => s + 1);
  }

  function goBack() {
    setError('');
    setStep((s) => s - 1);
  }

  const today = () => new Date().toLocaleDateString('he-IL').replace(/\//g, '-');

  // ─── Generate ──────────────────────────────────────────────
  async function handleGenerate() {
    setLoading(true);
    setError('');

    try {
      if (reportType === 'workers' || reportType === 'managers') {
        await generateWorkersReport();
      } else if (reportType === 'vehicles') {
        await generateVehiclesReport();
      } else if (reportType === 'equipment') {
        await generateEquipmentReport();
      } else if (reportType === 'issues') {
        await generateIssuesReport();
      }

      setDone(true);
      setTimeout(onClose, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה ביצוא');
    } finally {
      setLoading(false);
    }
  }

  async function generateWorkersReport() {
    const res = await fetch('/api/workers');
    if (!res.ok) throw new Error('שגיאה בטעינת עובדים');
    const all: WorkerWithDocuments[] = await res.json();
    const workersById = new Map(all.map((w) => [w.id, w]));

    const filtered = all.filter((w) => {
      if (!filters.show_inactive && !w.is_active) return false;
      if (reportType === 'managers' && !(w.is_responsible_site_manager && !w.subcontractor_id)) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!w.full_name.includes(filters.search) &&
            !(w.national_id ?? '').includes(q) &&
            !(w.passport_number ?? '').includes(q)) return false;
      }
      if (filters.status !== 'all') {
        const s = getWorkerStatus(w);
        if (filters.status === 'urgent' && s !== 'expired' && s !== 'missing') return false;
        if (filters.status === 'expiring_soon' && s !== 'expiring_soon') return false;
      }
      if (filters.manager_id && w.responsible_manager_id !== filters.manager_id) return false;
      if (filters.subcontractor_id) {
        const eff = getEffectiveSubcontractor(w, workersById as Map<string, Parameters<typeof getEffectiveSubcontractor>[0]>);
        if (eff?.id !== filters.subcontractor_id) return false;
      }
      return true;
    });

    const title = reportType === 'managers' ? 'מנהלי עבודה' : 'עובדים';
    if (format === 'excel') {
      generateWorkersExcel(filtered, title);
    } else {
      const html = buildWorkersHtml(filtered, title);
      await generatePdf(html, `${title}_${today()}.pdf`);
    }
  }

  async function generateVehiclesReport() {
    const res = await fetch('/api/vehicles');
    if (!res.ok) throw new Error('שגיאה בטעינת רכבים');
    const all: Vehicle[] = await res.json();

    const filtered = all.filter((v) => {
      if (!filters.show_inactive && !v.is_active) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!v.vehicle_number.toLowerCase().includes(q) &&
            !v.vehicle_type.toLowerCase().includes(q) &&
            !(v.model ?? '').toLowerCase().includes(q)) return false;
      }
      if (filters.status !== 'all') {
        const s = getVehicleStatus(v);
        if (filters.status === 'urgent' && s !== 'expired' && s !== 'missing') return false;
        if (filters.status === 'expiring_soon' && s !== 'expiring_soon') return false;
      }
      if (filters.manager_id && v.assigned_manager_id !== filters.manager_id) return false;
      return true;
    });

    if (format === 'excel') {
      generateVehiclesExcel(filtered);
    } else {
      const html = buildVehiclesHtml(filtered, 'רכבים');
      await generatePdf(html, `רכבים_${today()}.pdf`);
    }
  }

  async function generateEquipmentReport() {
    const res = await fetch('/api/heavy-equipment');
    if (!res.ok) throw new Error('שגיאה בטעינת ציוד');
    const all: HeavyEquipment[] = await res.json();

    const filtered = all.filter((eq) => {
      if (!filters.show_inactive && !eq.is_active) return false;
      if (filters.search && !eq.description.includes(filters.search)) return false;
      if (filters.status !== 'all') {
        const s = getHeavyEquipmentStatus(eq);
        if (filters.status === 'urgent' && s !== 'expired' && s !== 'missing') return false;
        if (filters.status === 'expiring_soon' && s !== 'expiring_soon') return false;
      }
      if (filters.subcontractor_id && eq.subcontractor_id !== filters.subcontractor_id) return false;
      return true;
    });

    if (format === 'excel') {
      generateEquipmentExcel(filtered);
    } else {
      const html = buildEquipmentHtml(filtered, 'כלי צמ"ה');
      await generatePdf(html, `כלי_צמה_${today()}.pdf`);
    }
  }

  async function generateIssuesReport() {
    const [workersRes, vehiclesRes, heavyRes, liftingRes] = await Promise.all([
      fetch('/api/workers'),
      fetch('/api/vehicles'),
      fetch('/api/heavy-equipment'),
      fetch('/api/lifting-equipment'),
    ]);

    if (!workersRes.ok || !vehiclesRes.ok || !heavyRes.ok || !liftingRes.ok) {
      throw new Error('שגיאה בטעינת נתונים');
    }

    const [workers, vehicles, heavy, lifting]: [WorkerWithDocuments[], Vehicle[], HeavyEquipment[], LiftingEquipment[]] =
      await Promise.all([workersRes.json(), vehiclesRes.json(), heavyRes.json(), liftingRes.json()]);

    let issues: Issue[] = buildAllIssues(workers, vehicles, heavy, lifting);

    // פילטור
    if (filters.status === 'urgent') {
      issues = issues.filter((i) => i.status !== 'expiring_soon');
    } else if (filters.status === 'expiring_soon') {
      issues = issues.filter((i) => i.status === 'expiring_soon');
    }
    if (filters.entity_type !== 'all') {
      issues = issues.filter((i) => i.entityType === filters.entity_type);
    }
    if (filters.subcontractor_id) {
      issues = issues.filter((i) => i.subcontractorId === filters.subcontractor_id);
    }
    if (filters.manager_id) {
      issues = issues.filter((i) => i.managerId === filters.manager_id);
    }
    if (filters.search) {
      issues = issues.filter((i) =>
        i.entityName.includes(filters.search) || i.problem.includes(filters.search)
      );
    }

    const statusTitle =
      filters.status === 'urgent' ? 'ליקויים דחופים' :
      filters.status === 'expiring_soon' ? 'עומד לפוג' :
      'דורש טיפול';

    if (format === 'excel') {
      generateIssuesExcel(issues, statusTitle);
    } else {
      const html = buildIssuesHtml(issues, statusTitle);
      await generatePdf(html, `${statusTitle}_${today()}.pdf`);
    }
  }

  // ─── UI ────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* כותרת */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">יצוא נתונים</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-50 bg-gray-50/50">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-1 flex-1 last:flex-none">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                i < step ? 'bg-orange-500 text-white' :
                i === step ? 'bg-orange-100 text-orange-600 ring-2 ring-orange-400' :
                'bg-gray-100 text-gray-400'
              }`}>{i < step ? '✓' : i + 1}</div>
              <span className={`text-xs whitespace-nowrap ${i === step ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-1 min-w-2" />}
            </div>
          ))}
        </div>

        {/* תוכן */}
        <div className="p-6 min-h-[260px]">
          {done ? (
            <div className="flex flex-col items-center justify-center h-full py-8 gap-3">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-2xl">✓</div>
              <p className="text-green-700 font-medium">הדוח הורד בהצלחה</p>
            </div>
          ) : (
            <>
              {/* שלב 0 — סוג דוח */}
              {step === 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 font-medium mb-3">בחר סוג דוח:</p>
                  {REPORT_OPTIONS.map(({ value, label, desc, icon }) => (
                    <label key={value} className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-colors ${
                      reportType === value ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input type="radio" name="reportType" value={value} checked={reportType === value}
                        onChange={() => setReportType(value)} className="accent-orange-500" />
                      <span className="text-lg">{icon}</span>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{label}</p>
                        <p className="text-xs text-gray-500">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* שלב 1 — פורמט */}
              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 font-medium mb-3">בחר פורמט יצוא:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex flex-col items-center p-5 rounded-xl border-2 cursor-pointer transition-colors ${
                      format === 'excel' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input type="radio" name="format" value="excel" checked={format === 'excel'}
                        onChange={() => setFormat('excel')} className="sr-only" />
                      <span className="text-3xl mb-2">📊</span>
                      <span className="font-bold text-gray-900">Excel</span>
                      <span className="text-xs text-gray-500 text-center mt-1">גיליון נתונים עם כל השדות</span>
                    </label>
                    <label className={`flex flex-col items-center p-5 rounded-xl border-2 cursor-pointer transition-colors ${
                      format === 'pdf' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input type="radio" name="format" value="pdf" checked={format === 'pdf'}
                        onChange={() => setFormat('pdf')} className="sr-only" />
                      <span className="text-3xl mb-2">📄</span>
                      <span className="font-bold text-gray-900">PDF</span>
                      <span className="text-xs text-gray-500 text-center mt-1">דוח מעוצב עם לוגו החברה</span>
                    </label>
                  </div>
                </div>
              )}

              {/* שלב 2 — סינונים */}
              {step === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 font-medium">סינונים (אופציונלי):</p>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">חיפוש חופשי</label>
                    <input
                      type="text"
                      value={filters.search}
                      onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                      placeholder="שם, מספר מזהה..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">סטטוס</label>
                      <select
                        value={filters.status}
                        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters['status'] }))}
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                      >
                        <option value="all">כל הסטטוסים</option>
                        <option value="urgent">לא תקין / חסר</option>
                        <option value="expiring_soon">עומד לפוג</option>
                      </select>
                    </div>

                    {reportType === 'issues' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">סוג ישות</label>
                        <select
                          value={filters.entity_type}
                          onChange={(e) => setFilters((f) => ({ ...f, entity_type: e.target.value as Filters['entity_type'] }))}
                          className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                        >
                          <option value="all">כל הסוגים</option>
                          <option value="worker">עובדים</option>
                          <option value="vehicle">רכבים</option>
                          <option value="heavy_equipment">כלי צמ"ה</option>
                          <option value="lifting_equipment">ציוד הרמה</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {(reportType === 'workers' || reportType === 'managers' || reportType === 'issues') && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">קבלן משנה</label>
                        <select
                          value={filters.subcontractor_id}
                          onChange={(e) => setFilters((f) => ({ ...f, subcontractor_id: e.target.value }))}
                          className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                        >
                          <option value="">כל הקבלנים</option>
                          {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      {reportType !== 'issues' && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">מנהל עבודה</label>
                          <select
                            value={filters.manager_id}
                            onChange={(e) => setFilters((f) => ({ ...f, manager_id: e.target.value }))}
                            className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                          >
                            <option value="">כל מנהלי העבודה</option>
                            {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
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

              {/* שלב 3 — צור דוח */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-gray-800 mb-3">סיכום:</p>
                    <SummaryRow label="סוג דוח" value={REPORT_OPTIONS.find(r => r.value === reportType)?.label ?? ''} />
                    <SummaryRow label="פורמט" value={format === 'excel' ? 'Excel' : 'PDF'} />
                    {filters.status !== 'all' && (
                      <SummaryRow label="סטטוס" value={filters.status === 'urgent' ? 'לא תקין / חסר' : 'עומד לפוג'} />
                    )}
                    {filters.subcontractor_id && (
                      <SummaryRow label="קבלן משנה" value={subcontractors.find(s => s.id === filters.subcontractor_id)?.name ?? ''} />
                    )}
                    {filters.manager_id && (
                      <SummaryRow label="מנהל עבודה" value={managers.find(m => m.id === filters.manager_id)?.full_name ?? ''} />
                    )}
                    {!filters.show_inactive && (
                      <SummaryRow label="רשומות לא פעילות" value="לא כלולות" />
                    )}
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                      {error}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* כפתורים */}
        {!done && (
          <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
            {step > 0 && (
              <button
                onClick={goBack}
                disabled={loading}
                className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                הקודם
              </button>
            )}
            <div className="flex-1" />
            {step < 3 ? (
              <button
                onClick={goNext}
                className="px-5 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                הבא
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="px-6 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'מייצא...' : `צור דוח ${format === 'excel' ? 'Excel' : 'PDF'}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}:</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
