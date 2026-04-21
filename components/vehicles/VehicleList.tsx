'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Vehicle } from '@/types';
import { getVehicleStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';

interface Props {
  vehicles: Vehicle[];
  imageUrls: Record<string, string>;
}

export default function VehicleList({ vehicles, imageUrls }: Props) {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const active = vehicles.filter((v) => v.is_active !== false);
  const inactiveCount = vehicles.length - active.length;

  const filtered = useMemo(() => {
    return vehicles.filter((v) => {
      if (!showInactive && v.is_active === false) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        v.vehicle_number.toLowerCase().includes(q) ||
        v.vehicle_type.toLowerCase().includes(q) ||
        (v.model ?? '').toLowerCase().includes(q) ||
        (v.vehicle_color ?? '').toLowerCase().includes(q) ||
        (v.assigned_manager?.full_name ?? '').includes(search)
      );
    });
  }, [vehicles, search, showInactive]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">רכבים</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {active.length} רכבים פעילים
            {inactiveCount > 0 && ` · ${inactiveCount} לא פעילים`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inactiveCount > 0 && (
            <button
              onClick={() => setShowInactive((v) => !v)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                showInactive ? 'bg-gray-200 text-gray-700 border-gray-300' : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {showInactive ? 'הסתר לא פעילים' : 'הצג לא פעילים'}
            </button>
          )}
          <Link
            href="/vehicles/new"
            className="bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
          >
            + רכב חדש
          </Link>
        </div>
      </div>

      <div className="relative">
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי מספר רכב, סוג או דגם..."
          className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent shadow-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h8l2-2zm0 0l2-5 3 1v4h-5z" />
          </svg>
          <p className="text-base font-medium">
            {search ? 'לא נמצאו רכבים התואמים את החיפוש' : 'אין רכבים במערכת עדיין'}
          </p>
          {!search && (
            <Link href="/vehicles/new" className="mt-3 inline-block text-sm text-orange-500 hover:text-orange-600">
              הוסף רכב ראשון
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} imageUrl={imageUrls[vehicle.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

function VehicleCard({ vehicle, imageUrl }: { vehicle: Vehicle; imageUrl?: string }) {
  const status = getVehicleStatus(vehicle);
  const isInactive = vehicle.is_active === false;

  const borderColor: Record<string, string> = {
    valid: 'border-r-green-500',
    expiring_soon: 'border-r-yellow-500',
    expired: 'border-r-red-500',
    missing: 'border-r-red-500',
    not_required: 'border-r-gray-300',
  };

  return (
    <Link
      href={`/vehicles/${vehicle.id}`}
      className={`flex items-center justify-between bg-white rounded-xl border border-gray-100 border-r-4 ${borderColor[status]} px-4 py-3.5 hover:shadow-md transition-all ${isInactive ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-blue-50">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={vehicle.vehicle_number} className="w-10 h-10 object-cover rounded-lg" />
          ) : (
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h8l2-2zm0 0l2-5 3 1v4h-5z" />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900" dir="ltr">{vehicle.vehicle_number}</p>
            {isInactive && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">לא פעיל</span>}
          </div>
          <p className="text-sm text-gray-400">
            {vehicle.vehicle_type}
            {vehicle.model && ` · ${vehicle.model}`}
            {vehicle.vehicle_color && ` · ${vehicle.vehicle_color}`}
            {vehicle.assigned_manager && ` · ${vehicle.assigned_manager.full_name}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 mr-2">
        {!isInactive && <StatusBadge status={status} size="sm" />}
        <svg className="w-4 h-4 text-gray-300 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
