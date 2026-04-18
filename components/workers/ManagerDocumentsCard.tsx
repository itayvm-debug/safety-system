'use client';

import { useState, useRef, useEffect } from 'react';
import { ManagerLicense, ManagerInsurance } from '@/types';
import { getDocumentStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  workerId: string;
  licenses: ManagerLicense[];
  insurances: ManagerInsurance[];
}

const LICENSE_PRESETS = ['רישיון אישי', 'רישיון רכב', 'רישיון קבלן'];

export default function ManagerDocumentsCard({ workerId, licenses: initialLicenses, insurances: initialInsurances }: Props) {
  const [licenses, setLicenses] = useState<ManagerLicense[]>(initialLicenses);
  const [insurances, setInsurances] = useState<ManagerInsurance[]>(initialInsurances);
  const [addingLicense, setAddingLicense] = useState(false);
  const [addingInsurance, setAddingInsurance] = useState(false);

  return (
    <div className="space-y-4">
      {/* רישיונות */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">רישיונות</h3>
        <div className="space-y-2">
          {licenses.map((lic) => (
            <ManagerFileRow
              key={lic.id}
              id={lic.id}
              label={lic.license_type}
              fileUrl={lic.file_url}
              expiryDate={lic.expiry_date}
              apiPath="manager-licenses"
              onDeleted={(id) => setLicenses((prev) => prev.filter((l) => l.id !== id))}
              onUpdated={(updated) => setLicenses((prev) => prev.map((l) => l.id === updated.id ? updated as ManagerLicense : l))}
            />
          ))}
          {addingLicense ? (
            <AddDocForm
              workerId={workerId}
              typeLabel="סוג הרישיון"
              typePresets={LICENSE_PRESETS}
              apiPath="manager-licenses"
              fieldName="license_type"
              onAdded={(item) => { setLicenses((prev) => [item as ManagerLicense, ...prev]); setAddingLicense(false); }}
              onCancel={() => setAddingLicense(false)}
            />
          ) : (
            <button onClick={() => setAddingLicense(true)}
              className="w-full border border-dashed border-gray-300 rounded-xl py-2.5 text-sm text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors">
              + הוסף רישיון
            </button>
          )}
        </div>
      </div>

      {/* ביטוחים */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">ביטוחים</h3>
        <div className="space-y-2">
          {insurances.map((ins) => (
            <ManagerFileRow
              key={ins.id}
              id={ins.id}
              label={ins.insurance_type}
              fileUrl={ins.file_url}
              expiryDate={ins.expiry_date}
              apiPath="manager-insurances"
              onDeleted={(id) => setInsurances((prev) => prev.filter((i) => i.id !== id))}
              onUpdated={(updated) => setInsurances((prev) => prev.map((i) => i.id === updated.id ? updated as ManagerInsurance : i))}
            />
          ))}
          {addingInsurance ? (
            <AddDocForm
              workerId={workerId}
              typeLabel="סוג הביטוח"
              typePresets={['ביטוח צד שלישי', 'ביטוח מקצועי', 'ביטוח בריאות']}
              apiPath="manager-insurances"
              fieldName="insurance_type"
              onAdded={(item) => { setInsurances((prev) => [item as ManagerInsurance, ...prev]); setAddingInsurance(false); }}
              onCancel={() => setAddingInsurance(false)}
            />
          ) : (
            <button onClick={() => setAddingInsurance(true)}
              className="w-full border border-dashed border-gray-300 rounded-xl py-2.5 text-sm text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors">
              + הוסף ביטוח
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ManagerFileRow({
  id, label, fileUrl, expiryDate, apiPath, onDeleted, onUpdated,
}: {
  id: string; label: string; fileUrl: string | null; expiryDate: string | null;
  apiPath: string;
  onDeleted: (id: string) => void;
  onUpdated: (item: ManagerLicense | ManagerInsurance) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const status = getDocumentStatus(fileUrl, expiryDate, true, !!expiryDate);

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
      if (res.ok) onUpdated(data);
      else setError(data.error ?? 'שגיאה');
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
      if (res.ok) onDeleted(id);
      else setError('שגיאה במחיקה');
    } finally { setDeleting(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-sm">{label}</span>
          {expiryDate && (
            <span className="text-xs text-gray-400">
              תוקף: {format(parseISO(expiryDate), 'dd/MM/yyyy', { locale: he })}
            </span>
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

function AddDocForm({
  workerId, typeLabel, typePresets, apiPath, fieldName, onAdded, onCancel,
}: {
  workerId: string; typeLabel: string; typePresets: string[];
  apiPath: string; fieldName: string;
  onAdded: (item: unknown) => void; onCancel: () => void;
}) {
  const [docType, setDocType] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!docType.trim()) { setError(`נדרש ${typeLabel}`); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/${apiPath}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: workerId, [fieldName]: docType.trim(), expiry_date: expiryDate || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה'); return; }
      onAdded(data);
    } catch { setError('שגיאת תקשורת'); } finally { setSaving(false); }
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">{typeLabel} *</label>
          <input type="text" value={docType} onChange={(e) => setDocType(e.target.value)} list="doc-presets"
            placeholder={typePresets[0]}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          <datalist id="doc-presets">
            {typePresets.map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">תאריך תוקף</label>
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" dir="ltr" />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">ביטול</button>
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50">
          {saving ? 'שומר...' : 'הוסף'}
        </button>
      </div>
    </div>
  );
}
