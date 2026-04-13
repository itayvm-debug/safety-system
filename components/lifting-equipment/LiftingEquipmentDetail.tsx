'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LiftingEquipment } from '@/types';
import { getEquipmentDocumentStatus, getLiftingEquipmentStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';
import ToggleSwitch from '@/components/ToggleSwitch';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

export default function LiftingEquipmentDetail({ equipment }: { equipment: LiftingEquipment }) {
  const router = useRouter();
  const [eq, setEq] = useState<LiftingEquipment>(equipment);
  const [pendingExpiry, setPendingExpiry] = useState('');
  const [hasPending, setHasPending] = useState(false);
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState('');

  const overallStatus = getLiftingEquipmentStatus(eq);
  const inspectionStatus = getEquipmentDocumentStatus(eq.inspection_file_url, eq.inspection_expiry, true);

  function handleExpiryChange(value: string) {
    setPendingExpiry(value);
    setHasPending(value !== (eq.inspection_expiry ?? ''));
  }

  async function handleSaveExpiry() {
    setSavingExpiry(true);
    try {
      const res = await fetch(`/api/lifting-equipment/${eq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspection_expiry: pendingExpiry || null }),
      });
      const data = await res.json();
      if (res.ok) { setEq(data); setHasPending(false); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); }
    } finally { setSavingExpiry(false); }
  }

  async function handleToggleActive() {
    setTogglingActive(true);
    try {
      const res = await fetch(`/api/lifting-equipment/${eq.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !eq.is_active }),
      });
      const data = await res.json();
      if (res.ok) setEq(data);
    } finally { setTogglingActive(false); }
  }

  async function handleDelete() {
    if (!confirm(`למחוק את "${eq.description}"?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/lifting-equipment/${eq.id}`, { method: 'DELETE' });
    if (res.ok) { router.push('/lifting-equipment'); router.refresh(); }
    else { alert('שגיאה'); setDeleting(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setFileError('');
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('folder', 'equipment');
      const ur = await fetch('/api/upload', { method: 'POST', body: fd });
      const ud = await ur.json();
      if (!ur.ok) { setFileError(ud.error ?? 'שגיאה'); return; }
      const res = await fetch(`/api/lifting-equipment/${eq.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspection_file_url: ud.path }),
      });
      const data = await res.json();
      if (res.ok) setEq(data);
    } catch { setFileError('שגיאה'); } finally { setUploading(false); }
  }

  async function handleDeleteFile() {
    if (!confirm('למחוק את הקובץ?')) return;
    const res = await fetch(`/api/lifting-equipment/${eq.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspection_file_url: null }),
    });
    const data = await res.json();
    if (res.ok) setEq(data);
  }

  async function handleView() {
    if (!eq.inspection_file_url) return;
    const res = await fetch(`/api/signed-url?path=${encodeURIComponent(eq.inspection_file_url)}`);
    const d = await res.json();
    if (d.url) window.open(d.url, '_blank');
  }

  const displayExpiry = hasPending ? pendingExpiry : (eq.inspection_expiry ?? '');

  return (
    <div className="space-y-6 pb-24">
      <div className={`bg-white rounded-xl border p-6 ${!eq.is_active ? 'border-gray-300 opacity-80' : 'border-gray-200'}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{eq.description}</h1>
              {!eq.is_active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">לא פעיל</span>}
            </div>
            {eq.subcontractor?.name && <p className="text-sm text-gray-500 mt-1">קבלן: {eq.subcontractor.name}</p>}
            {eq.project_name && <p className="text-sm text-gray-400">פרויקט: {eq.project_name}</p>}
            <p className="text-xs text-gray-300 mt-1">עודכן: {format(parseISO(eq.updated_at), 'dd/MM/yyyy', { locale: he })}</p>
          </div>
          <StatusBadge status={overallStatus} />
        </div>

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
          <Link href={`/lifting-equipment/${eq.id}/edit`}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
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
          <button onClick={handleDelete} disabled={deleting}
            className="px-4 py-2 text-sm border border-red-200 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">
            {deleting ? 'מוחק...' : 'מחיקה'}
          </button>
        </div>
      </div>

      {/* תסקיר */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">תסקיר</h2>
        <div className={`bg-white rounded-xl border p-4 ${hasPending ? 'border-orange-300' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900">תעודת תסקיר</h3>
            <StatusBadge status={inspectionStatus} size="sm" />
          </div>

          <div className="flex items-center gap-2 mb-3">
            <label className="text-sm text-gray-500 whitespace-nowrap">תוקף:</label>
            <input type="date" value={displayExpiry} onChange={(e) => handleExpiryChange(e.target.value)}
              className={`flex-1 px-2 py-1 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${hasPending ? 'border-orange-300' : 'border-gray-200'}`}
              dir="ltr" />
          </div>

          {fileError && <p className="text-xs text-red-600 mb-2">{fileError}</p>}

          <div className="flex items-center gap-2">
            {eq.inspection_file_url ? (
              <>
                <button onClick={handleView} className="text-sm text-orange-500 hover:text-orange-600">צפה</button>
                <button onClick={handleDeleteFile} className="text-sm text-red-400 hover:text-red-600">מחק</button>
              </>
            ) : (
              <span className="text-sm text-gray-400">לא הועלה קובץ</span>
            )}
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="mr-auto text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
              {uploading ? 'מעלה...' : eq.inspection_file_url ? 'החלף' : 'העלה'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={handleUpload} />
          </div>
        </div>
      </div>

      {(hasPending || saveSuccess) && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 shadow-lg px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            {saveSuccess
              ? <p className="text-sm text-green-600 font-medium">✓ נשמר בהצלחה</p>
              : <p className="text-sm text-gray-500">שינוי תאריך ממתין לשמירה</p>
            }
            {hasPending && (
              <div className="flex gap-2 mr-auto">
                <button onClick={() => { setPendingExpiry(''); setHasPending(false); }} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 text-gray-600">ביטול</button>
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
