'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HeavyEquipment } from '@/types';
import { getEquipmentDocumentStatus, getHeavyEquipmentStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';
import ToggleSwitch from '@/components/ToggleSwitch';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props { equipment: HeavyEquipment; }

type FileField = 'license_file_url' | 'insurance_file_url' | 'inspection_file_url';
type ExpiryField = 'license_expiry' | 'insurance_expiry' | 'inspection_expiry';

interface FileSection {
  label: string;
  fileField: FileField;
  expiryField: ExpiryField;
  required: boolean;
}

const SECTIONS: FileSection[] = [
  { label: 'רישיון / רישוי', fileField: 'license_file_url', expiryField: 'license_expiry', required: true },
  { label: 'ביטוח', fileField: 'insurance_file_url', expiryField: 'insurance_expiry', required: true },
  { label: 'תסקיר', fileField: 'inspection_file_url', expiryField: 'inspection_expiry', required: false },
];

export default function HeavyEquipmentDetail({ equipment }: Props) {
  const router = useRouter();
  const [eq, setEq] = useState<HeavyEquipment>(equipment);
  const [pendingExpiry, setPendingExpiry] = useState<Partial<Record<ExpiryField, string>>>({});
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const overallStatus = getHeavyEquipmentStatus(eq);
  const hasPending = Object.keys(pendingExpiry).length > 0;

  function handleExpiryChange(field: ExpiryField, value: string) {
    const saved = eq[field] ?? '';
    setPendingExpiry((prev) => {
      const next = { ...prev };
      if (value === saved) delete next[field];
      else next[field] = value;
      return next;
    });
  }

  async function handleSaveExpiry() {
    setSavingExpiry(true);
    try {
      const res = await fetch(`/api/heavy-equipment/${eq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingExpiry),
      });
      const data = await res.json();
      if (res.ok) {
        setEq(data);
        setPendingExpiry({});
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } finally { setSavingExpiry(false); }
  }

  async function handleToggleActive() {
    setTogglingActive(true);
    try {
      const res = await fetch(`/api/heavy-equipment/${eq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !eq.is_active }),
      });
      const data = await res.json();
      if (res.ok) setEq(data);
    } finally { setTogglingActive(false); }
  }

  async function handleDelete() {
    if (!confirm(`למחוק את "${eq.description}"? פעולה זו בלתי הפיכה.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/heavy-equipment/${eq.id}`, { method: 'DELETE' });
    if (res.ok) { router.push('/heavy-equipment'); router.refresh(); }
    else { alert('שגיאה במחיקה'); setDeleting(false); }
  }

  return (
    <div className="space-y-6 pb-24">
      {/* כרטיס ראשי */}
      <div className={`bg-white rounded-xl border p-6 ${!eq.is_active ? 'border-gray-300 opacity-80' : 'border-gray-200'}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{eq.description}</h1>
              {!eq.is_active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">לא פעיל</span>}
            </div>
            {eq.license_number && <p className="text-sm text-gray-500 mt-1">רישיון: {eq.license_number}</p>}
            {eq.subcontractor?.name && <p className="text-sm text-gray-500">קבלן: {eq.subcontractor.name}</p>}
            {eq.project_name && <p className="text-sm text-gray-400">פרויקט: {eq.project_name}</p>}
            <p className="text-xs text-gray-300 mt-1">עודכן: {format(parseISO(eq.updated_at), 'dd/MM/yyyy', { locale: he })}</p>
          </div>
          <StatusBadge status={overallStatus} />
        </div>

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
          <Link
            href={`/heavy-equipment/${eq.id}/edit`}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            עריכת פרטים
          </Link>
          <div className="flex items-center gap-2 px-1">
            <ToggleSwitch
              checked={eq.is_active}
              onChange={handleToggleActive}
              disabled={togglingActive}
            />
            <span className="text-sm text-gray-600">
              {togglingActive ? '...' : eq.is_active ? 'סמן כלא פעיל' : 'סמן כפעיל'}
            </span>
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deleting ? 'מוחק...' : 'מחיקה'}
          </button>
        </div>
      </div>

      {/* מסמכים */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">מסמכים</h2>
        <div className="space-y-3">
          {SECTIONS.map((section) => {
            const fileUrl = eq[section.fileField];
            const expiry = pendingExpiry[section.expiryField] ?? eq[section.expiryField] ?? '';
            const isPending = section.expiryField in pendingExpiry;
            const status = getEquipmentDocumentStatus(fileUrl, expiry || null, section.required);

            return (
              <EquipmentFileCard
                key={section.fileField}
                equipmentId={eq.id}
                label={section.label}
                fileField={section.fileField}
                fileUrl={fileUrl}
                expiry={expiry}
                isPending={isPending}
                required={section.required}
                status={status}
                onExpiryChange={(v) => handleExpiryChange(section.expiryField, v)}
                onFileUploaded={(newUrl) => {
                  setEq((prev) => ({ ...prev, [section.fileField]: newUrl }));
                  router.refresh();
                }}
                onFileDeleted={() => {
                  setEq((prev) => ({ ...prev, [section.fileField]: null, [section.expiryField]: null }));
                  router.refresh();
                }}
              />
            );
          })}
        </div>
      </div>

      {/* שמירת תאריכים */}
      {(hasPending || saveSuccess) && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 shadow-lg px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            {saveSuccess
              ? <p className="text-sm text-green-600 font-medium">✓ נשמר בהצלחה</p>
              : <p className="text-sm text-gray-500">{Object.keys(pendingExpiry).length} שינויים ממתינים</p>
            }
            {hasPending && (
              <div className="flex gap-2 mr-auto">
                <button onClick={() => setPendingExpiry({})} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 text-gray-600">ביטול</button>
                <button onClick={handleSaveExpiry} disabled={savingExpiry} className="px-6 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50">
                  {savingExpiry ? 'שומר...' : 'שמור שינויים'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── כרטיס קובץ ציוד ──────────────────────────────────────────
function EquipmentFileCard({
  equipmentId,
  label,
  fileField,
  fileUrl,
  expiry,
  isPending,
  required,
  status,
  onExpiryChange,
  onFileUploaded,
  onFileDeleted,
}: {
  equipmentId: string;
  label: string;
  fileField: FileField;
  fileUrl: string | null;
  expiry: string;
  isPending: boolean;
  required: boolean;
  status: import('@/types').DocumentStatus;
  onExpiryChange: (v: string) => void;
  onFileUploaded: (url: string) => void;
  onFileDeleted: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('folder', 'equipment');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
      const ud = await uploadRes.json();
      if (!uploadRes.ok) { setError(ud.error ?? 'שגיאה'); return; }

      const res = await fetch(`/api/heavy-equipment/${equipmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [fileField]: ud.path }),
      });
      if (res.ok) onFileUploaded(ud.path);
    } catch { setError('שגיאה'); } finally { setUploading(false); }
  }

  async function handleDelete() {
    if (!confirm('למחוק את הקובץ?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/heavy-equipment/${equipmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [fileField]: null }),
      });
      if (res.ok) onFileDeleted();
    } finally { setDeleting(false); }
  }

  async function handleView() {
    if (!fileUrl) return;
    setOpening(true);
    try {
      const res = await fetch(`/api/signed-url?path=${encodeURIComponent(fileUrl)}`);
      const d = await res.json();
      if (d.url) window.open(d.url, '_blank');
    } finally { setOpening(false); }
  }

  return (
    <div className={`bg-white rounded-xl border p-4 ${isPending ? 'border-orange-300' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-gray-900">{label}</h3>
          {!required && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">אופציונלי</span>}
        </div>
        <StatusBadge status={status} size="sm" />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <label className="text-sm text-gray-500 whitespace-nowrap">תוקף:</label>
        <input
          type="date" value={expiry} onChange={(e) => onExpiryChange(e.target.value)}
          className={`flex-1 px-2 py-1 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${isPending ? 'border-orange-300' : 'border-gray-200'}`}
          dir="ltr"
        />
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="flex items-center gap-2">
        {fileUrl ? (
          <>
            <button onClick={handleView} disabled={opening} className="text-sm text-orange-500 hover:text-orange-600 disabled:opacity-50">
              {opening ? 'פותח...' : 'צפה'}
            </button>
            <button onClick={handleDelete} disabled={deleting} className="text-sm text-red-400 hover:text-red-600 disabled:opacity-50">
              {deleting ? 'מוחק...' : 'מחק'}
            </button>
          </>
        ) : (
          <span className="text-sm text-gray-400">לא הועלה קובץ</span>
        )}
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="mr-auto text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
          {uploading ? 'מעלה...' : fileUrl ? 'החלף' : 'העלה'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={handleUpload} />
      </div>
    </div>
  );
}
