'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Vehicle, VehicleLicense, VehicleInsurance } from '@/types';
import { getVehicleStatus, getDocumentStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';
import { formatDateSafe } from '@/lib/utils/date';
import VehicleForm from './VehicleForm';
import CameraCapture from '@/components/CameraCapture';

interface Props {
  vehicle: Vehicle;
  imageUrl: string | null;
  managers: { id: string; full_name: string }[];
}

const INSURANCE_TYPES = ['ביטוח חובה', 'ביטוח מקיף', 'ביטוח צד ג'] as const;
type InsuranceType = typeof INSURANCE_TYPES[number];

export default function VehicleDetail({ vehicle: initial, imageUrl: initialImageUrl, managers }: Props) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState<Vehicle>(initial);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const licenses = vehicle.vehicle_licenses ?? [];
  const insurances = vehicle.vehicle_insurances ?? [];
  const status = getVehicleStatus(vehicle);

  function updateLicense(updated: VehicleLicense) {
    setVehicle((v) => ({
      ...v,
      vehicle_licenses: (v.vehicle_licenses ?? []).map((l) => l.id === updated.id ? updated : l),
    }));
  }
  function addLicense(lic: VehicleLicense) {
    setVehicle((v) => ({ ...v, vehicle_licenses: [...(v.vehicle_licenses ?? []), lic] }));
  }
  function updateInsurance(updated: VehicleInsurance) {
    setVehicle((v) => ({
      ...v,
      vehicle_insurances: (v.vehicle_insurances ?? []).map((i) => i.id === updated.id ? updated : i),
    }));
  }
  function addInsurance(ins: VehicleInsurance) {
    setVehicle((v) => ({ ...v, vehicle_insurances: [...(v.vehicle_insurances ?? []), ins] }));
  }

  async function handleDelete() {
    if (!confirm(`למחוק את הרכב ${vehicle.vehicle_number}?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/vehicles/${vehicle.id}`, { method: 'DELETE' });
      if (res.ok) { router.push('/vehicles'); router.refresh(); }
    } finally { setDeleting(false); }
  }

  if (editing) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 text-sm">
            ← חזור לפרטים
          </button>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-6">עריכת רכב</h2>
        <VehicleForm
          vehicle={vehicle}
          managers={managers}
          onSaved={(updated) => {
            setVehicle(updated);
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* כותרת */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start gap-4">
          <VehicleImageUploader
            vehicleId={vehicle.id}
            imageUrl={imageUrl}
            onUploaded={(url, path) => {
              setImageUrl(url);
              setVehicle((v) => ({ ...v, image_url: path }));
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xl font-bold text-gray-900" dir="ltr">{vehicle.vehicle_number}</p>
                <p className="text-sm text-gray-500">
                  {vehicle.vehicle_type}
                  {vehicle.model && ` · ${vehicle.model}`}
                  {vehicle.vehicle_color && ` · ${vehicle.vehicle_color}`}
                </p>
                {vehicle.assigned_manager && (
                  <p className="text-sm text-blue-600 mt-0.5">מנהל עבודה: {vehicle.assigned_manager.full_name}</p>
                )}
                {vehicle.project_name && (
                  <p className="text-sm text-gray-400 mt-0.5">פרויקט: {vehicle.project_name}</p>
                )}
              </div>
              <StatusBadge status={status} />
            </div>
            {vehicle.notes && (
              <p className="text-sm text-gray-400 mt-2 border-t border-gray-100 pt-2">{vehicle.notes}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={() => setEditing(true)}
            className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            עריכה
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm px-4 py-2 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deleting ? 'מוחק...' : 'מחק רכב'}
          </button>
        </div>
      </div>

      {/* רישיון רכב */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">רישיון רכב</h2>
        {licenses.length > 0 ? (
          <VehicleDocRow
            id={licenses[0].id}
            label="רישיון רכב"
            fileUrl={licenses[0].file_url}
            expiryDate={licenses[0].expiry_date}
            apiPath="vehicle-licenses"
            required
            onUpdated={updateLicense}
          />
        ) : (
          <AddVehicleLicenseButton vehicleId={vehicle.id} onAdded={addLicense} />
        )}
      </div>

      {/* ביטוחים */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">ביטוחים</h2>
        <div className="space-y-2">
          {INSURANCE_TYPES.map((type) => {
            const existing = insurances.find((i) => i.insurance_type === type);
            const isRequired = type === 'ביטוח חובה';
            return existing ? (
              <VehicleDocRow
                key={existing.id}
                id={existing.id}
                label={type}
                fileUrl={existing.file_url}
                expiryDate={existing.expiry_date}
                apiPath="vehicle-insurances"
                required={isRequired}
                onUpdated={(item) => updateInsurance(item as VehicleInsurance)}
              />
            ) : (
              <EmptyVehicleInsuranceRow
                key={type}
                vehicleId={vehicle.id}
                insuranceType={type}
                required={isRequired}
                onAdded={addInsurance}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── תמונת רכב ───────────────────────────────────────────────────
function VehicleImageUploader({
  vehicleId, imageUrl, onUploaded,
}: {
  vehicleId: string;
  imageUrl: string | null;
  onUploaded: (signedUrl: string, storagePath: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  async function uploadFile(file: File | Blob, filename?: string) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file, filename);
      fd.append('folder', 'vehicles');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
      const ud = await uploadRes.json();
      if (!uploadRes.ok) return;

      await fetch(`/api/vehicles/${vehicleId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: ud.path }),
      });

      const signedRes = await fetch(`/api/signed-url?path=${encodeURIComponent(ud.path)}`);
      const sd = await signedRes.json();
      if (sd.url) onUploaded(sd.url, ud.path);
    } finally { setUploading(false); }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    await uploadFile(file, file.name);
  }

  async function handleCapture(blob: Blob) {
    setCameraOpen(false);
    await uploadFile(blob, `vehicle_${Date.now()}.jpg`);
  }

  return (
    <>
      <div
        className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer bg-gray-100 border border-gray-200 flex items-center justify-center relative"
        onClick={() => fileInputRef.current?.click()}
        title="לחץ להעלאת תמונה מגלריה"
      >
        {uploading ? (
          <span className="text-xs text-gray-400">מעלה...</span>
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="תמונת רכב" className="w-full h-full object-cover" />
        ) : (
          <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h8l2-2zm0 0l2-5 3 1v4h-5z" />
          </svg>
        )}

        {/* כפתור מצלמה */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setCameraOpen(true); }}
          disabled={uploading}
          className="absolute -bottom-1 -left-1 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 disabled:opacity-50"
          title="צלם תמונה"
        >
          <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
      </div>

      {cameraOpen && (
        <CameraCapture
          title="צילום רכב"
          shape="object"
          onCapture={handleCapture}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );
}

// ── שורת מסמך רכב (עם עריכת תאריך תוקף) ───────────────────────
function VehicleDocRow({
  id, label, fileUrl, expiryDate, apiPath, required, onUpdated,
}: {
  id: string; label: string; fileUrl: string | null; expiryDate: string | null;
  apiPath: string; required: boolean;
  onUpdated: (item: VehicleLicense | VehicleInsurance) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [newExpiry, setNewExpiry] = useState(expiryDate ?? '');
  const [savingExpiry, setSavingExpiry] = useState(false);

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

  async function handleSaveExpiry() {
    setSavingExpiry(true); setError('');
    try {
      const res = await fetch(`/api/${apiPath}/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiry_date: newExpiry || null }),
      });
      const data = await res.json();
      if (res.ok) { onUpdated(data); setEditingExpiry(false); }
      else setError(data.error ?? 'שגיאה');
    } catch { setError('שגיאה'); } finally { setSavingExpiry(false); }
  }

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 text-sm">{label}</span>
          {!required && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">אופציונלי</span>}
          {expiryDate && formatDateSafe(expiryDate) && !editingExpiry && (
            <span className="text-xs text-gray-400">תוקף: {formatDateSafe(expiryDate)}</span>
          )}
        </div>
        <StatusBadge status={status} size="sm" />
      </div>

      {/* עריכת תאריך תוקף */}
      {editingExpiry ? (
        <div className="flex items-center gap-2 mb-2">
          <input
            type="date"
            value={newExpiry}
            onChange={(e) => setNewExpiry(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            dir="ltr"
            autoFocus
          />
          <button onClick={handleSaveExpiry} disabled={savingExpiry}
            className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
            {savingExpiry ? '...' : 'שמור'}
          </button>
          <button onClick={() => { setEditingExpiry(false); setNewExpiry(expiryDate ?? ''); }}
            className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
            ביטול
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditingExpiry(true)}
          className="text-xs text-gray-400 hover:text-orange-500 mb-2 block transition-colors"
        >
          {expiryDate ? `תאריך תוקף: ${formatDateSafe(expiryDate)} (עריכה)` : '+ הגדר תאריך תוקף'}
        </button>
      )}

      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      <div className="flex items-center gap-2">
        {fileUrl ? (
          <button onClick={handleView} disabled={opening} className="text-sm text-orange-500 hover:text-orange-600 disabled:opacity-50">
            {opening ? 'פותח...' : 'צפה'}
          </button>
        ) : (
          <span className="text-sm text-gray-400">לא הועלה קובץ</span>
        )}
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="mr-auto text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 bg-white">
          {uploading ? 'מעלה...' : fileUrl ? 'החלף' : 'העלה'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleUpload} />
      </div>
    </div>
  );
}

// ── הוספת רישיון רכב ────────────────────────────────────────────
function AddVehicleLicenseButton({ vehicleId, onAdded }: { vehicleId: string; onAdded: (l: VehicleLicense) => void }) {
  const [open, setOpen] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/vehicle-licenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle_id: vehicleId, expiry_date: expiryDate || null }),
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
        + הוסף רישיון רכב
      </button>
    );
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 whitespace-nowrap">תאריך תוקף:</label>
        <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} dir="ltr"
          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
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

// ── שורת ביטוח ריקה ─────────────────────────────────────────────
function EmptyVehicleInsuranceRow({
  vehicleId, insuranceType, required, onAdded,
}: {
  vehicleId: string; insuranceType: string; required: boolean;
  onAdded: (i: VehicleInsurance) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const status = getDocumentStatus(null, null, required, true);

  async function handleCreate() {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/vehicle-insurances', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle_id: vehicleId, insurance_type: insuranceType, expiry_date: expiryDate || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה'); return; }
      onAdded(data); setOpen(false);
    } catch { setError('שגיאת תקשורת'); } finally { setSaving(false); }
  }

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-sm">{insuranceType}</span>
          {!required && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">אופציונלי</span>}
        </div>
        <StatusBadge status={status} size="sm" />
      </div>
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-sm text-orange-500 hover:text-orange-600">
          + הוסף
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">תאריך תוקף:</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} dir="ltr"
              className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">ביטול</button>
            <button onClick={handleCreate} disabled={saving}
              className="px-5 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {saving ? 'שומר...' : 'הוסף'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
