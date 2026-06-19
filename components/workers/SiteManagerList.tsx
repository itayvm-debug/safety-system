'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { WorkerWithDocuments } from '@/types';
import { getWorkerStatus } from '@/lib/documents/status';
import { getWorkerIdentifierValue } from '@/lib/workers/identifier';
import StatusBadge from '@/components/StatusBadge';
import StatusFilterTabs, { StatusFilter, computeStatusCounts, matchesStatusFilter } from '@/components/StatusFilterTabs';
import { saveSnapshot, loadSnapshot } from '@/lib/offline/cache';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export default function SiteManagerList() {
  const [allWorkers, setAllWorkers] = useState<WorkerWithDocuments[]>([]);
  const [loading, setLoading] = useState(true);
  const isOnline = useOnlineStatus();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    let active = true;
    async function load() {
      const cached = loadSnapshot<WorkerWithDocuments[]>('workers');
      if (cached && active) { setAllWorkers(cached); setLoading(false); }

      if (!navigator.onLine) { if (active) setLoading(false); return; }

      try {
        const res = await fetch('/api/workers');
        if (!res.ok) throw new Error('fetch failed');
        const data: WorkerWithDocuments[] = await res.json();
        if (active) { setAllWorkers(data); setLoading(false); saveSnapshot('workers', data); }
      } catch { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, []);

  // מנהלי עבודה: פעילים, ללא שיוך לקבלן משנה
  const managers = useMemo(
    () => allWorkers.filter((w) => w.is_responsible_site_manager && w.is_active !== false && !w.subcontractor_id),
    [allWorkers]
  );

  const counts = useMemo(() => computeStatusCounts(managers, getWorkerStatus), [managers]);

  const filtered = useMemo(() => {
    return managers.filter((m) => {
      if (!matchesStatusFilter(m, filter, getWorkerStatus)) return false;
      if (!search) return true;
      return m.full_name.includes(search) || getWorkerIdentifierValue(m).includes(search);
    });
  }, [managers, search, filter]);

  if (loading && allWorkers.length === 0) return (
    <div className="space-y-3 animate-pulse">
      {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
    </div>
  );

  if (!isOnline && allWorkers.length === 0) return (
    <div className="text-center py-16 text-gray-400 text-sm">אין נתונים שמורים להצגה במצב לא מקוון</div>
  );

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

      <StatusFilterTabs filter={filter} counts={counts} onChange={setFilter} />

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-base font-medium">
            {search || filter !== 'all' ? 'לא נמצאו מנהלי עבודה התואמים את הסינון' : 'אין מנהלי עבודה מוגדרים עדיין'}
          </p>
          {!search && filter === 'all' && (
            <p className="text-sm mt-1">ניתן לסמן עובד כמנהל עבודה בעמוד פרטי העובד</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((manager) => (
            <ManagerCard key={manager.id} manager={manager} />
          ))}
        </div>
      )}
    </div>
  );
}

function ManagerCard({ manager }: { manager: WorkerWithDocuments }) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const status = getWorkerStatus(manager);

  useEffect(() => {
    if (!manager.photo_url) return;
    let cancelled = false;
    fetch(`/api/signed-url?path=${encodeURIComponent(manager.photo_url)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.url) setPhotoSrc(d.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [manager.photo_url]);

  const borderColor: Record<string, string> = {
    valid: 'border-r-green-500',
    expiring_soon: 'border-r-yellow-500',
    expired: 'border-r-red-500',
    missing: 'border-r-red-500',
    not_required: 'border-r-gray-300',
  };

  return (
    <Link
      href={`/workers/${manager.id}`}
      className={`flex items-center justify-between bg-white rounded-xl border border-gray-100 border-r-4 ${borderColor[status]} px-4 py-3.5 hover:shadow-md transition-all`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0 overflow-hidden bg-blue-100 text-blue-700">
          {photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc} alt={manager.full_name} className="w-10 h-10 object-cover" />
          ) : (
            manager.full_name.charAt(0)
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{manager.full_name}</p>
          <p className="text-sm text-gray-400">
            {manager.is_foreign_worker ? 'דרכון' : 'ת.ז.'} {getWorkerIdentifierValue(manager)}
            {manager.phone && ` · ${manager.phone}`}
            {manager.project_name && ` · ${manager.project_name}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 mr-2">
        <StatusBadge status={status} size="sm" />
        <svg className="w-4 h-4 text-gray-300 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
