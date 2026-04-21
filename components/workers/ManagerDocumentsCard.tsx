'use client';

import { useState, useRef } from 'react';
import { ManagerLicense } from '@/types';
import { getDocumentStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';
import { formatDateSafe } from '@/lib/utils/date';

interface Props {
  workerId: string;
  licenses: ManagerLicense[];
}

const DRIVING_LICENSE_TYPE = 'רישיון נהיגה';

export default function ManagerDocumentsCard({ workerId, licenses: initialLicenses }: Props) {
  const [licenses, setLicenses] = useState<ManagerLicense[]>(initialLicenses);

  const drivingLicenses = licenses.filter((l) => l.license_type === DRIVING_LICENSE_TYPE);

  function updateLicense(updated: ManagerLicense) {
    setLicenses((prev) => prev.map((l) => l.id === updated.id ? updated : l));
  }
  function deleteLicense(id: string) {
    setLicenses((prev) => prev.filter((l) => l.id !== id));
  }
  function addLicense(item: ManagerLicense) {
    setLicenses((prev) => [item, ...prev]);
  }

  return (
    <div className="space-y-5">

      {/* רישיון נהיגה */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">רישיון נהיגה</h3>
        <div className="space-y-2">
          {drivingLicenses.map((lic) => (
            <ManagerFileRow
              key={lic.id}
              id={lic.id}
              label="רישיון נהיגה"
              fileUrl={lic.file_url}
              expiryDate={lic.expiry_date}
              apiPath="manager-licenses"
              required={true}
              onDeleted={deleteLicense}
              onUpdated={(item) => updateLicense(item as ManagerLicense)}
            />
          ))}
          {drivingLicenses.length === 0 && (
            <AddSingleLicenseButton
              workerId={workerId}
              licenseType={DRIVING_LICENSE_TYPE}
              onAdded={addLicense}
            />
          )}
        </div>
      </div>

    </div>
  );
}

// ── הוספת רישיון נהיגה (כפתור) ──────────────────────────────────
function AddSingleLicenseButton({
  workerId, licenseType, onAdded,
}: {
  workerId: string; licenseType: string; onAdded: (l: ManagerLicense) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/manager-licenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: workerId, license_type: licenseType, expiry_date: expiryDate || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה'); return; }
      onAdded(data); setOpen(false);
    } catch { setError('שגיאת תקשורת'); } finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full border border-dashed border-gray-300 rounded-xl py-2 text-sm text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors">
        + הוסף {licenseType}
      </button>
    );
  }

  return (
    <div className="bg-white border border-orange-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 whitespace-nowrap">תאריך תוקף:</label>
        <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" dir="ltr" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">ביטול</button>
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50">
          {saving ? 'שומר...' : 'הוסף'}
        </button>
      </div>
    </div>
  );
}

// ── שורת מסמך כללית (קובץ + תוקף) ──────────────────────────────
function ManagerFileRow({
  id, label, fileUrl, expiryDate, apiPath, required, onDeleted, onUpdated,
}: {
  id: string; label: string; fileUrl: string | null; expiryDate: string | null;
  apiPath: string; required: boolean;
  onDeleted: (id: string) => void;
  onUpdated: (item: ManagerLicense) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const status = getDocumentStatus(fileUrl, expiryDate, required, true);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('folder', 'documents');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
      const ud = await uploadRes.json();
      if (!uploadRes.ok) { setError(ud.error ?? 'שגיאה'); return; }
      const res = await fetch(`/api/${apiPath}/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: ud.path }),
      });
      const data = await res.json();
      if (res.ok) onUpdated(data); else setError(data.error ?? 'שגיאה');
    } catch { setError('שגיאה'); } finally { setUploading(false); }
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

  async function handleDelete() {
    if (!confirm(`למחוק את "${label}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/${apiPath}/${id}`, { method: 'DELETE' });
      if (res.ok) onDeleted(id); else setError('שגיאה במחיקה');
    } finally { setDeleting(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 text-sm">{label}</span>
          {!required && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">אופציונלי</span>}
          {expiryDate && formatDateSafe(expiryDate) && (
            <span className="text-xs text-gray-400">תוקף: {formatDateSafe(expiryDate)}</span>
          )}
        </div>
        <StatusBadge status={status} size="sm" />
      </div>
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      <div className="flex items-center gap-2">
        {fileUrl ? (
          <button onClick={handleView} disabled={opening} className="text-sm text-orange-500 hover:text-orange-600 disabled:opacity-50">
            {opening ? 'פותח...' : 'צפה'}
          </button>
        ) : (
          <span className="text-sm text-gray-400">לא הועלה קובץ</span>
        )}
        <button onClick={handleDelete} disabled={deleting} className="text-sm text-red-400 hover:text-red-600 disabled:opacity-50">
          {deleting ? '...' : 'מחק'}
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="mr-auto text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
          {uploading ? 'מעלה...' : fileUrl ? 'החלף' : 'העלה'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleUpload} />
      </div>
    </div>
  );
}
