'use client';

import { useState } from 'react';
import { ProfessionalLicense } from '@/types';
import { getDocumentStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';
import FileUploadZone from '@/components/FileUploadZone';
import { formatDateSafe } from '@/lib/utils/date';

const DRIVING_LICENSES = [
  'רישיון נהיגה A', 'רישיון נהיגה A1', 'רישיון נהיגה A2',
  'רישיון נהיגה B', 'רישיון נהיגה C1', 'רישיון נהיגה C',
  'רישיון נהיגה CE', 'רישיון נהיגה D', 'רישיון נהיגה D1',
  'היתר מלגזה', 'היתר מכונה ניידת', 'היתר צמ"ה', 'מפעיל במת הרמה',
];

const PROFESSIONAL_LICENSES = [
  'חשמלאי עוזר', 'חשמלאי מעשי', 'חשמלאי מוסמך', 'חשמלאי ראשי', 'מהנדס חשמל',
  'מנהל עבודה', 'עוזר בטיחות', 'ממונה בטיחות',
  'מנופאי', 'אתת', 'רתך', 'מפעיל עגורן', 'עובד גז', 'מפעיל ציוד מכני',
];

interface Props {
  workerId: string;
  licenses: ProfessionalLicense[];
}

export default function ProfessionalLicensesCard({ workerId, licenses: initial }: Props) {
  const [licenses, setLicenses] = useState<ProfessionalLicense[]>(initial);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      {licenses.map((lic) => (
        <LicenseRow
          key={lic.id}
          license={lic}
          onDeleted={(id) => setLicenses((prev) => prev.filter((l) => l.id !== id))}
          onUpdated={(upd) => setLicenses((prev) => prev.map((l) => l.id === upd.id ? upd : l))}
        />
      ))}
      {adding ? (
        <AddLicenseForm
          workerId={workerId}
          onAdded={(lic) => { setLicenses((prev) => [lic, ...prev]); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
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
  onDeleted,
  onUpdated,
}: {
  license: ProfessionalLicense;
  onDeleted: (id: string) => void;
  onUpdated: (lic: ProfessionalLicense) => void;
}) {
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const status = getDocumentStatus(license.file_url, license.expiry_date, true, true);

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

  async function handleFileUploaded(path: string) {
    setUploading(true); setError('');
    try {
      const res = await fetch(`/api/professional-licenses/${license.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: path }),
      });
      const data = await res.json();
      if (res.ok) onUpdated(data);
      else setError(data.error ?? 'שגיאה');
    } catch { setError('שגיאה'); } finally { setUploading(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{license.license_type}</h3>
          {license.license_number && (
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0" dir="ltr">{license.license_number}</span>
          )}
          {license.expiry_date && formatDateSafe(license.expiry_date) && (
            <span className="text-xs text-gray-400 shrink-0">תוקף: {formatDateSafe(license.expiry_date)}</span>
          )}
        </div>
        <StatusBadge status={status} size="sm" />
      </div>
      {license.notes && <p className="text-xs text-gray-400 mb-2">{license.notes}</p>}
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="space-y-2">
        <FileUploadZone
          folder="documents"
          onUploaded={(path) => handleFileUploaded(path)}
          currentFileName={license.file_url ? 'קובץ קיים' : undefined}
          disabled={uploading}
        />
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
        </div>
      </div>
    </div>
  );
}

function LicenseTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isCustom = value !== '' && ![...DRIVING_LICENSES, ...PROFESSIONAL_LICENSES].includes(value);
  const [custom, setCustom] = useState(isCustom ? value : '');
  const [mode, setMode] = useState<'select' | 'custom'>(isCustom ? 'custom' : 'select');

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === '__other__') { setMode('custom'); onChange(custom); }
    else { setMode('select'); onChange(v); }
  }

  function handleCustom(e: React.ChangeEvent<HTMLInputElement>) {
    setCustom(e.target.value);
    onChange(e.target.value);
  }

  if (mode === 'custom') {
    return (
      <div className="flex gap-1">
        <input
          autoFocus
          type="text"
          value={custom}
          onChange={handleCustom}
          placeholder="הקלד סוג רישיון..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <button
          type="button"
          onClick={() => { setMode('select'); onChange(''); }}
          className="px-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg"
        >
          ↩
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={handleSelect}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
    >
      <option value="">-- בחר סוג רישיון --</option>
      <optgroup label="רישיונות נהיגה">
        {DRIVING_LICENSES.map((l) => <option key={l} value={l}>{l}</option>)}
      </optgroup>
      <optgroup label="הסמכות מקצועיות">
        {PROFESSIONAL_LICENSES.map((l) => <option key={l} value={l}>{l}</option>)}
      </optgroup>
      <option value="__other__">אחר (הקלד ידנית)</option>
    </select>
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
  const [licenseType, setLicenseType] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!licenseType.trim()) { setError('יש לבחור סוג רישיון'); return; }
    if (!expiryDate) { setError('תאריך תוקף חובה לרישיון מקצועי'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/professional-licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: workerId,
          license_type: licenseType.trim(),
          license_number: licenseNumber.trim() || null,
          expiry_date: expiryDate || null,
          file_url: fileUrl || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה'); return; }
      onAdded(data);
    } catch { setError('שגיאת תקשורת'); } finally { setSaving(false); }
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-medium text-orange-700">הוספת רישיון מקצועי</p>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">סוג הרישיון <span className="text-red-500">*</span></label>
        <LicenseTypeSelect value={licenseType} onChange={setLicenseType} />
      </div>

      <div className="grid grid-cols-2 gap-3">
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

      <FileUploadZone
        folder="documents"
        label="מסמך רישיון"
        onUploaded={(path) => setFileUrl(path)}
      />

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
          ביטול
        </button>
        <button
          onClick={handleSave}
          disabled={!licenseType.trim() || !expiryDate || saving}
          className="px-6 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'שומר...' : 'הוסף רישיון'}
        </button>
      </div>
    </div>
  );
}
