'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Vehicle } from '@/types';
import { getVehicleStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';

interface Props {
  workerId: string;
  initialVehicles: Vehicle[];
}

export default function WorkerVehicleCard({ workerId, initialVehicles }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [showModal, setShowModal] = useState(false);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  async function handleAssign(vehicleId: string, currentManagerName?: string) {
    if (currentManagerName) {
      if (!confirm(`הרכב כבר משויך ל-${currentManagerName}. להעביר את השיוך?`)) return;
    }

    if (replaceTargetId) {
      await fetch(`/api/vehicles/${replaceTargetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_manager_id: null }),
      });
    }

    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_manager_id: workerId }),
    });
    if (!res.ok) return;
    const updated: Vehicle = await res.json();

    setVehicles((prev) => {
      const base = replaceTargetId ? prev.filter((v) => v.id !== replaceTargetId) : prev;
      return [...base.filter((v) => v.id !== vehicleId), updated];
    });
    setShowModal(false);
    setReplaceTargetId(null);
  }

  async function handleUnassign(vehicleId: string) {
    if (!confirm('לנתק את הרכב ממנהל העבודה? הרכב לא יימחק.')) return;
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_manager_id: null }),
    });
    if (res.ok) setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
  }

  function handleReplace(vehicleId: string) {
    setReplaceTargetId(vehicleId);
    setShowModal(true);
  }

  return (
    <div className="space-y-3">
      {vehicles.map((v) => (
        <LinkedVehicleRow
          key={v.id}
          vehicle={v}
          onUnassign={() => handleUnassign(v.id)}
          onReplace={() => handleReplace(v.id)}
        />
      ))}

      {vehicles.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center space-y-3">
          <p className="text-sm text-gray-500">לא קיים רכב מקושר למנהל עבודה זה.</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
            >
              שייך רכב קיים
            </button>
            <Link
              href={`/vehicles/new?manager_id=${workerId}`}
              className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors text-center"
            >
              צור רכב חדש
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => { setReplaceTargetId(null); setShowModal(true); }}
            className="flex-1 border border-dashed border-gray-300 rounded-xl py-2 text-center text-sm text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
          >
            + שייך רכב נוסף
          </button>
          <Link
            href={`/vehicles/new?manager_id=${workerId}`}
            className="flex-1 border border-dashed border-gray-300 rounded-xl py-2 text-center text-sm text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
          >
            + צור רכב חדש
          </Link>
        </div>
      )}

      {showModal && (
        <VehiclePickerModal
          workerId={workerId}
          assignedVehicleIds={vehicles.map((v) => v.id)}
          replaceTarget={replaceTargetId ? vehicles.find((v) => v.id === replaceTargetId) : undefined}
          onAssign={handleAssign}
          onClose={() => { setShowModal(false); setReplaceTargetId(null); }}
        />
      )}
    </div>
  );
}

// ── רכב מקושר ───────────────────────────────────────────────────
function LinkedVehicleRow({
  vehicle, onUnassign, onReplace,
}: {
  vehicle: Vehicle;
  onUnassign: () => void;
  onReplace: () => void;
}) {
  const status = getVehicleStatus(vehicle);
  const lic = (vehicle.vehicle_licenses ?? [])[0] ?? null;
  const mandatoryIns = (vehicle.vehicle_insurances ?? []).find((i) => i.insurance_type === 'ביטוח חובה');

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-medium text-gray-900 text-sm" dir="ltr">{vehicle.vehicle_number}</p>
          <p className="text-xs text-gray-500">
            {vehicle.vehicle_type}
            {vehicle.model && ` · ${vehicle.model}`}
            {vehicle.vehicle_color && ` · ${vehicle.vehicle_color}`}
          </p>
        </div>
        <StatusBadge status={status} size="sm" />
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
        <span>רישיון: {lic?.file_url ? (lic.expiry_date ? `תוקף ${lic.expiry_date}` : 'קיים') : 'חסר'}</span>
        <span>·</span>
        <span>ביטוח חובה: {mandatoryIns?.file_url ? (mandatoryIns.expiry_date ? `תוקף ${mandatoryIns.expiry_date}` : 'קיים') : 'חסר'}</span>
      </div>
      <div className="flex items-center gap-4">
        <Link href={`/vehicles/${vehicle.id}`} className="text-sm text-orange-500 hover:text-orange-600 font-medium">
          פתח כרטיס ←
        </Link>
        <button onClick={onReplace} className="text-sm text-gray-500 hover:text-gray-700">
          החלף רכב
        </button>
        <button onClick={onUnassign} className="text-sm text-red-400 hover:text-red-600">
          בטל שיוך
        </button>
      </div>
    </div>
  );
}

// ── Modal לבחירת רכב ─────────────────────────────────────────────
function VehiclePickerModal({
  workerId,
  assignedVehicleIds,
  replaceTarget,
  onAssign,
  onClose,
}: {
  workerId: string;
  assignedVehicleIds: string[];
  replaceTarget?: Vehicle;
  onAssign: (vehicleId: string, currentManagerName?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/vehicles')
      .then((r) => r.json())
      .then((data: Vehicle[]) => { setAllVehicles(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = allVehicles.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.vehicle_number.toLowerCase().includes(q) ||
      (v.vehicle_type ?? '').toLowerCase().includes(q) ||
      (v.model ?? '').toLowerCase().includes(q)
    );
  });

  async function handlePick(v: Vehicle) {
    const isAlreadyLinked = assignedVehicleIds.includes(v.id) && v.id !== replaceTarget?.id;
    if (isAlreadyLinked) return;

    const otherManager =
      v.assigned_manager_id && v.assigned_manager_id !== workerId
        ? v.assigned_manager?.full_name
        : undefined;

    setAssigning(v.id);
    try {
      await onAssign(v.id, otherManager);
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vehicle-picker-title"
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 id="vehicle-picker-title" className="font-bold text-gray-900">שייך רכב קיים</h3>
            {replaceTarget && (
              <p className="text-xs text-gray-400 mt-0.5">
                מחליף: <span dir="ltr">{replaceTarget.vehicle_number}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="סגור חלון" className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי מספר רכב, סוג או דגם..."
              className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {loading && (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">
              {search ? 'לא נמצאו רכבים התואמים את החיפוש' : 'אין רכבים זמינים'}
            </p>
          )}
          {filtered.map((v) => {
            const isCurrentlyLinked = assignedVehicleIds.includes(v.id) && v.id !== replaceTarget?.id;
            const hasOtherManager = v.assigned_manager_id && v.assigned_manager_id !== workerId;
            const status = getVehicleStatus(v);

            return (
              <button
                key={v.id}
                onClick={() => handlePick(v)}
                disabled={isCurrentlyLinked || assigning !== null}
                className={`w-full text-right p-3 rounded-xl border transition-all ${
                  isCurrentlyLinked
                    ? 'border-orange-200 bg-orange-50 cursor-default opacity-70'
                    : 'border-gray-200 bg-white hover:border-orange-400 hover:shadow-sm active:bg-orange-50 cursor-pointer'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm" dir="ltr">{v.vehicle_number}</p>
                    <p className="text-xs text-gray-500">
                      {v.vehicle_type}{v.model && ` · ${v.model}`}
                    </p>
                    {hasOtherManager && (
                      <p className="text-xs text-amber-600 mt-0.5">
                        ⚠ משויך ל-{v.assigned_manager?.full_name}
                      </p>
                    )}
                    {isCurrentlyLinked && (
                      <p className="text-xs text-orange-600 font-medium mt-0.5">✓ מקושר כבר</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={status} size="sm" />
                    {assigning === v.id && (
                      <span className="w-3.5 h-3.5 border border-orange-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
