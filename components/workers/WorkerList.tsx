'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WorkerWithDocuments, DocumentStatus, WORKER_TYPE_LABELS } from '@/types';
import { getWorkerStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';
import ToggleSwitch from '@/components/ToggleSwitch';

type FilterType = 'all' | DocumentStatus;

interface WorkerListProps {
  workers: WorkerWithDocuments[];
  photoUrls: Record<string, string>;
}

export default function WorkerList({ workers, photoUrls }: WorkerListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [subcontractorFilter, setSubcontractorFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');

  // רשימת קבלני משנה ייחודיים
  const subcontractors = useMemo(() => {
    const map = new Map<string, string>();
    workers.forEach((w) => {
      if (w.subcontractor?.id && w.subcontractor?.name) {
        map.set(w.subcontractor.id, w.subcontractor.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [workers]);

  // רשימת אחראי אתר ייחודיים
  const siteManagers = useMemo(() => {
    return workers
      .filter((w) => w.is_responsible_site_manager)
      .map((w) => ({ id: w.id, name: w.full_name }));
  }, [workers]);

  const filtered = useMemo(() => {
    return workers.filter((w) => {
      // is_active === false (ולא undefined) — כדי שעובדים ישנים ללא העמודה לא יוסתרו
      if (!showInactive && w.is_active === false) return false;
      const matchesSearch =
        !search ||
        w.full_name.includes(search) ||
        w.id_number.includes(search);
      const status = getWorkerStatus(w);
      const matchesFilter = filter === 'all' || status === filter;
      const matchesSub = !subcontractorFilter || w.subcontractor_id === subcontractorFilter;
      const matchesManager = !managerFilter || w.responsible_manager_id === managerFilter;
      return matchesSearch && matchesFilter && matchesSub && matchesManager;
    });
  }, [workers, search, filter, showInactive, subcontractorFilter, managerFilter]);

  const activeWorkers = workers.filter((w) => w.is_active);
  const inactiveCount = workers.length - activeWorkers.length;

  const counts = useMemo(() => {
    const base = showInactive ? workers : activeWorkers;
    const c = { all: base.length, expired: 0, missing: 0, expiring_soon: 0, valid: 0, not_required: 0 };
    base.forEach((w) => {
      const s = getWorkerStatus(w);
      if (s === 'expired' || s === 'missing') c.expired++;
      else if (s === 'expiring_soon') c.expiring_soon++;
      else c.valid++;
    });
    return c;
  }, [workers, activeWorkers, showInactive]);

  const filterButtons: { label: string; value: FilterType; count: number; activeClass: string }[] = [
    { label: 'הכל', value: 'all', count: counts.all, activeClass: 'bg-gray-800 text-white border-gray-800' },
    { label: 'לא תקין', value: 'expired', count: counts.expired, activeClass: 'bg-red-600 text-white border-red-600' },
    { label: 'עומד לפוג', value: 'expiring_soon', count: counts.expiring_soon, activeClass: 'bg-yellow-500 text-white border-yellow-500' },
    { label: 'תקין', value: 'valid', count: counts.valid, activeClass: 'bg-green-600 text-white border-green-600' },
  ];

  return (
    <div className="space-y-5">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">עובדים</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeWorkers.length} עובדים פעילים
            {inactiveCount > 0 && ` · ${inactiveCount} לא פעילים`}
          </p>
        </div>
        {inactiveCount > 0 && (
          <button
            onClick={() => setShowInactive((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              showInactive
                ? 'bg-gray-200 text-gray-700 border-gray-300'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            {showInactive ? 'הסתר לא פעילים' : 'הצג לא פעילים'}
          </button>
        )}
      </div>

      {/* חיפוש */}
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

      {/* פילטרי קבלן + מנהל */}
      {(subcontractors.length > 0 || siteManagers.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {subcontractors.length > 0 && (
            <select
              value={subcontractorFilter}
              onChange={(e) => setSubcontractorFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="">כל קבלני המשנה</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {siteManagers.length > 0 && (
            <select
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="">כל האחראים</option>
              {siteManagers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* פילטרים */}
      <div className="flex flex-wrap gap-2">
        {filterButtons.map((btn) => (
          <button
            key={btn.value}
            onClick={() => setFilter(btn.value === filter ? 'all' : btn.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
              filter === btn.value
                ? btn.activeClass
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {btn.label}
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${filter === btn.value ? 'bg-white/20' : 'bg-gray-100'}`}>
              {btn.count}
            </span>
          </button>
        ))}
      </div>

      {/* רשימה */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-base font-medium">
            {search || filter !== 'all' ? 'לא נמצאו עובדים התואמים את החיפוש' : 'אין עובדים במערכת עדיין'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} photoUrl={photoUrls[worker.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkerCard({ worker, photoUrl }: { worker: WorkerWithDocuments; photoUrl?: string }) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(worker.is_active !== false);
  const [toggling, setToggling] = useState(false);
  const status = getWorkerStatus(worker);
  const isInactive = !isActive;

  const leftBorder: Record<string, string> = {
    valid: 'border-r-green-500',
    expiring_soon: 'border-r-yellow-500',
    expired: 'border-r-red-500',
    missing: 'border-r-red-500',
    not_required: 'border-r-gray-300',
  };

  async function handleToggle() {
    setToggling(true);
    setIsActive((v) => !v);
    try {
      await fetch(`/api/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      router.refresh();
    } catch {
      setIsActive((v) => !v); // revert on error
    } finally {
      setToggling(false);
    }
  }

  return (
    <Link
      href={`/workers/${worker.id}`}
      className={`flex items-center justify-between bg-white rounded-xl border border-gray-100 border-r-4 ${leftBorder[status]} px-4 py-3.5 hover:shadow-md transition-all ${isInactive ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* תמונה / אווטאר */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0 overflow-hidden ${isInactive ? 'bg-gray-100 text-gray-400' : 'bg-orange-100 text-orange-700'}`}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={worker.full_name} className="w-10 h-10 object-cover" />
          ) : (
            worker.full_name.charAt(0)
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 truncate">{worker.full_name}</p>
            {isInactive && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">לא פעיל</span>}
          </div>
          <p className="text-sm text-gray-400">
            ת.ז. {worker.id_number} · {WORKER_TYPE_LABELS[worker.worker_type]}
            {worker.subcontractor?.name && ` · ${worker.subcontractor.name}`}
            {worker.project_name && ` · ${worker.project_name}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 mr-2">
        {!isInactive && <StatusBadge status={status} size="sm" />}
        <ToggleSwitch checked={isActive} onChange={handleToggle} disabled={toggling} />
        <svg className="w-4 h-4 text-gray-300 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
