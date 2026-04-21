'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Vehicle } from '@/types';
import { getVehicleStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';

interface Props {
  workerId: string;
  initialVehicles: Vehicle[];
}

const VEHICLE_TYPES = ['רכב פרטי', 'רכב מסחרי', 'ג׳יפ', 'משאית', 'טנדר', 'אחר'];

export default function WorkerVehicleCard({ workerId, initialVehicles }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);

  function addVehicle(v: Vehicle) {
    setVehicles((prev) => [v, ...prev]);
  }

  if (vehicles.length > 0) {
    return (
      <div className="space-y-3">
        {vehicles.map((v) => (
          <LinkedVehicleRow key={v.id} vehicle={v} />
        ))}
        <AddVehicleForm workerId={workerId} onAdded={addVehicle} />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
      <p className="text-sm text-gray-500 mb-3">לא קיים רכב מקושר למנהל עבודה זה.</p>
      <AddVehicleForm workerId={workerId} onAdded={addVehicle} />
    </div>
  );
}

function LinkedVehicleRow({ vehicle }: { vehicle: Vehicle }) {
  const status = getVehicleStatus(vehicle);
  const lic = (vehicle.vehicle_licenses ?? [])[0] ?? null;
  const mandatoryIns = (vehicle.vehicle_insurances ?? []).find(
    (i) => i.insurance_type === 'ביטוח חובה'
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-medium text-gray-900 text-sm" dir="ltr">{vehicle.vehicle_number}</p>
          <p className="text-xs text-gray-500">
            {vehicle.vehicle_type}{vehicle.model ? ` · ${vehicle.model}` : ''}
          </p>
        </div>
        <StatusBadge status={status} size="sm" />
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>רישיון: {lic?.file_url ? (lic.expiry_date ? `תוקף ${lic.expiry_date}` : 'קיים') : 'חסר'}</span>
        <span>·</span>
        <span>ביטוח חובה: {mandatoryIns?.file_url ? (mandatoryIns.expiry_date ? `תוקף ${mandatoryIns.expiry_date}` : 'קיים') : 'חסר'}</span>
      </div>
      <div className="mt-2">
        <Link
          href={`/vehicles/${vehicle.id}`}
          className="text-sm text-orange-500 hover:text-orange-600 font-medium"
        >
          פתח כרטיס רכב ←
        </Link>
      </div>
    </div>
  );
}

function AddVehicleForm({ workerId, onAdded }: { workerId: string; onAdded: (v: Vehicle) => void }) {
  const [open, setOpen] = useState(false);
  const [vehicleType, setVehicleType] = useState(VEHICLE_TYPES[0]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!vehicleNumber.trim()) { setError('מספר רכב הוא שדה חובה'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_type: vehicleType,
          vehicle_number: vehicleNumber.trim(),
          model: model.trim() || null,
          assigned_manager_id: workerId,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה'); return; }
      onAdded({ ...data, vehicle_licenses: [], vehicle_insurances: [] });
      setOpen(false);
      setVehicleNumber(''); setModel('');
    } catch { setError('שגיאת תקשורת'); } finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border border-dashed border-gray-300 rounded-xl py-2 text-sm text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
      >
        + קשר רכב למנהל עבודה זה
      </button>
    );
  }

  return (
    <div className="bg-white border border-orange-200 rounded-xl p-3 space-y-3">
      <p className="text-xs font-medium text-gray-600">רכב חדש — יישמר גם בעמוד הרכבים</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">סוג רכב</label>
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            {VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">מספר רכב *</label>
          <input
            type="text"
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value)}
            placeholder="12-345-67"
            dir="ltr"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">דגם (אופציונלי)</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Toyota Hilux"
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">ביטול</button>
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50">
          {saving ? 'שומר...' : 'הוסף רכב'}
        </button>
      </div>
    </div>
  );
}
