'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Worker } from '@/types';

interface Props {
  managers: Worker[];
  photoUrls: Record<string, string>;
}

export default function SiteManagerList({ managers, photoUrls }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return managers.filter((m) => {
      if (!search) return true;
      return m.full_name.includes(search) || m.id_number.includes(search);
    });
  }, [managers, search]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">מנהלי עבודה</h1>
        <p className="text-sm text-gray-500 mt-0.5">{managers.length} מנהלי עבודה פעילים</p>
      </div>

      <div className="relative">
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם או תעודת זהות..."
          className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent shadow-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-base font-medium">
            {search ? 'לא נמצאו מנהלי עבודה התואמים את החיפוש' : 'אין מנהלי עבודה מוגדרים עדיין'}
          </p>
          {!search && (
            <p className="text-sm mt-1">
              ניתן לסמן עובד כמנהל עבודה בעמוד פרטי העובד
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((manager) => (
            <ManagerCard key={manager.id} manager={manager} photoUrl={photoUrls[manager.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

function ManagerCard({ manager, photoUrl }: { manager: Worker; photoUrl?: string }) {
  return (
    <Link
      href={`/workers/${manager.id}`}
      className="flex items-center justify-between bg-white rounded-xl border border-gray-100 border-r-4 border-r-blue-500 px-4 py-3.5 hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0 overflow-hidden bg-blue-100 text-blue-700">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={manager.full_name} className="w-10 h-10 object-cover" />
          ) : (
            manager.full_name.charAt(0)
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{manager.full_name}</p>
          <p className="text-sm text-gray-400">
            ת.ז. {manager.id_number}
            {manager.phone && ` · ${manager.phone}`}
            {manager.project_name && ` · ${manager.project_name}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 mr-2">
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">מנהל עבודה</span>
        <svg className="w-4 h-4 text-gray-300 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
