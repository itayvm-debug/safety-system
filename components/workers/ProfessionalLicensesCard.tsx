'use client';

import { useState, useRef } from 'react';
import { ProfessionalLicense } from '@/types';
import { getDocumentStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';
import { formatDateSafe } from '@/lib/utils/date';

interface Props {
  workerId: string;
  licenses: ProfessionalLicense[];
}

export default function ProfessionalLicensesCard({ workerId, licenses: initial }: Props) {
  const [licenses, setLicenses] = useState<ProfessionalLicense[]>(initial);
  const [adding, setAdding] = useState(false);

  function handleAdded(lic: ProfessionalLicense) {
    setLicenses((prev) => [lic, ...prev]);
    setAdding(false);
  }

  function handleDeleted(id: string) {
    setLicenses((prev) => prev.filter((l) => l.id !== id));
  }

  function handleUpdated(updated: ProfessionalLicense) {
    setLicenses((prev) => prev.map((l) => l.id === updated.id ? updated : l));
  }

  return (
    <div className="space-y-3">
      {licenses.map((lic) => (
        <LicenseRow key={lic.id} license={lic} workerId={workerId} onDeleted={handleDeleted} onUpdated={handleUpdated} />
      ))}
      {adding ? (
        <AddLicenseForm workerId={workerId} onAdded={handleAdded} onCancel={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full border border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
        >
          + הוסף רישיון מקצועי
        </button>
      )}
    </div>
  );
}

function LicenseRow({
  license,
  workerId,
  onDeleted,
  onUpdated,
}: {
  license: ProfessionalLicense;
  workerId: string;
  onDeleted: (id: string) => void;
  onUpdated: (lic: ProfessionalLicense) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const status = getDocumentStatus(license.file_url, license.expiry_date, true, !!license.expiry_date);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('folder', 'documents');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
      const ud = await uploadRes.json();
      if (!uploadRes.ok) { setError(ud.error ?? 'שגיאה'); return; }

      const res = await fetch(`/api/professional-licenses/${license.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: ud.path }),
      });
      const data = await res.json();
      if (res.ok) onUpdated(data);
      else setError(data.error ?? 'שגיאה');
    } catch { setError('שגיאה'); } finally { setUploading(false); }
  }

  async function handleView() {
    if (!license.file_url) return;
    setOpening(true);
    try {
      const res = await fetch(`/api/signed-url?path=${encodeURIComponent(license.file_url)}`);
      const d = await res.json();
      if (d.url) window.open(d.url, '_blank');
    } finally { setOpening(false); }
  }

  async function handleDelete() {
    if (!confirm(`למחוק את הרישיון "${license.license_type}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/professional-licenses/${license.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted(license.id);
      else setError('שגיאה במחיקה');
    } finally { setDeleting(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium text-gray-900">{license.license_type}</h3>
          {license.license_number && (
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded" dir="ltr">{license.license_number}</span>
          )}
          {license.expiry_date && formatDateSafe(license.expiry_date) && (
            <span className="text-xs text-gray-400">
              תוקף: {formatDateSafe(license.expiry_date)}
            </span>
          )}
        </div>
        <StatusBadge status={status} size="sm" />
      </div>
      {license.notes && <p className="text-xs text-gray-400 mb-2">{license.notes}</p>}
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        {license.file_url ? (
          <button onClick={handleView} disabled={opening} className="text-sm text-orange-500 hover:text-orange-600 disabled:opacity-50">
            {opening ? 'פותח...' : 'צפה במסמך'}
          </button>
        ) : (
          <span className="text-sm text-amber-600 font-medium">⚠ חסר מסמך</span>
        )}
        <button onClick={handleDelete} disabled={deleting} className="text-sm text-red-400 hover:text-red-600 disabled:opacity-50">
          {deleting ? 'מוחק...' : 'מחק'}
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="mr-auto text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
          {uploading ? 'מעלה...' : license.file_url ? 'החלף מסמך' : 'העלה מסמך'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleUpload} />
      </div>
    </div>
  );
}

function AddLicenseForm({
  workerId,
  onAdded,
  onCancel,
}: {
  workerId: string;
  onAdded: (lic: ProfessionalLicense) => void;
  onCancel: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [licenseType, setLicenseType] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'documents');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה בהעלאת קובץ'); return; }
      setFileUrl(data.path);
      setFileName(file.name);
    } catch { setError('שגיאת תקשורת בהעלאת קובץ'); } finally { setUploading(false); }
  }

  async function handleSave() {
    if (!licenseType.trim()) { setError('יש להזין סוג הרישיון'); return; }
    if (!expiryDate) { setError('יש להזין תאריך תוקף לרישיון'); return; }
    if (!fileUrl) { setError('חובה להעלות מסמך עבור הרישיון'); return; }

    setSaving(true); setError('');
    try {
      const res = await fetch('/api/professional-licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: workerId,
          license_type: licenseType.trim(),
          license_number: licenseNumber.trim() || null,
          expiry_date: expiryDate,
          file_url: fileUrl,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה'); return; }
      onAdded(data);
    } catch { setError('שגיאת תקשורת'); } finally { setSaving(false); }
  }

  const canSave = licenseType.trim() && expiryDate && fileUrl && !uploading;

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-medium text-orange-700">הוספת רישיון מקצועי — כל השדות המסומנים חובה</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">סוג הרישיון <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={licenseType}
            onChange={(e) => setLicenseType(e.target.value)}
            placeholder="למשל: רישיון נהיגה, הסמכת ריתוך..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">מספר רישיון</label>
          <input
            type="text"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="אופציונלי"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            dir="ltr"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">תאריך תוקף <span className="text-red-500">*</span></label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            dir="ltr"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">הערות</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="אופציונלי"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
      </div>

      {/* העלאת מסמך – חובה */}
      <div className="border border-dashed rounded-lg p-3 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-700">מסמך רישיון <span className="text-red-500">*</span></span>
            {fileUrl ? (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {fileName}
              </span>
            ) : (
              <span className="text-xs text-gray-400">לא הועלה עדיין</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-sm px-3 py-1.5 border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 disabled:opacity-50 transition-colors"
          >
            {uploading ? 'מעלה...' : fileUrl ? 'החלף' : 'העלה קובץ'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
          ביטול
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          title={!canSave ? 'יש להזין סוג רישיון, תאריך תוקף ולהעלות מסמך' : ''}
          className="px-6 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'שומר...' : 'הוסף רישיון'}
        </button>
      </div>
    </div>
  );
}
