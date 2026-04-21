'use client';

import Link from 'next/link';
import { Vehicle } from '@/types';
import { getVehicleStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';

interface Props {
  workerId: string;
  initialVehicles: Vehicle[];
}

export default function WorkerVehicleCard({ workerId, initialVehicles }: Props) {
  if (initialVehicles.length > 0) {
    return (
      <div className="space-y-3">
        {initialVehicles.map((v) => (
          <LinkedVehicleRow key={v.id} vehicle={v} />
        ))}
        <Link
          href={`/vehicles/new?manager_id=${workerId}`}
          className="block w-full border border-dashed border-gray-300 rounded-xl py-2 text-center text-sm text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
        >
          + קשר רכב נוסף
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
      <p className="text-sm text-gray-500 mb-3">לא קיים רכב מקושר למנהל עבודה זה.</p>
      <Link
        href={`/vehicles/new?manager_id=${workerId}`}
        className="inline-block text-sm font-medium text-orange-500 hover:text-orange-600"
      >
        צור רכב חדש ←
      </Link>
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
            {vehicle.vehicle_type}
            {vehicle.model && ` · ${vehicle.model}`}
            {vehicle.vehicle_color && ` · ${vehicle.vehicle_color}`}
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
