'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WorkerWithDocuments, DocumentStatus } from '@/types';
import { getWorkerIdentifierValue } from '@/lib/workers/identifier';
import { getWorkerStatus } from '@/lib/documents/status';
import { getEffectiveSubcontractor, EffectiveSubcontractor } from '@/lib/workers/subcontractor';
import StatusBadge from '@/components/StatusBadge';
import ToggleSwitch from '@/components/ToggleSwitch';
import { saveSnapshot, loadSnapshot } from '@/lib/offline/cache';
import { createClient } from '@/lib/supabase/client';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

type FilterType = 'all' | DocumentStatus;

const WORKERS_QUERY = '*, documents(*), safety_briefings(*), height_restrictions(id,expires_at,created_at), professional_licenses(id,file_url,expiry_date,license_type), subcontractor:subcontractors!workers_subcontractor_id_fkey(id, name), lifting_machine_appointments(id), manager_licenses(*), vehicles(*, vehicle_licenses(*), vehicle_insurances(*))';

export default function WorkerList() {
  const [workers, setWorkers] = useState<WorkerWithDocuments[]>([]);
  const [loading, setLoading] = useState(true);
  const isOnline = useOnlineStatus();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [subcontractorFilter, setSubcontractorFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      // Show cached data immediately (stale-while-revalidate)
      const cached = loadSnapshot<WorkerWithDocuments[]>('workers');
      if (cached && active) { setWorkers(cached); setLoading(false); }

      if (!navigator.onLine) { if (active) setLoading(false); return; }

      try {
        const { data } = await createClient()
          .from('workers').select(WORKERS_QUERY).order('full_name');
        if (active) {
          const list = (data ?? []) as WorkerWithDocuments[];
          setWorkers(list); setLoading(false); saveSnapshot('workers', list);
        }
      } catch { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, []);

  // מפה של כל העובדים לפי ID — לחישוב ירושת קבלן
  const workersById = useMemo(() => {
    const m = new Map<string, WorkerWithDocuments>();
    workers.forEach((w) => m.set(w.id, w));
    return m;
  }, [workers]);

  // רשימת קבלני משנה ייחודיים — כולל ירושה ממנהל עבודה
  const subcontractors = useMemo(() => {
    const map = new Map<string, string>();
    workers.forEach((w) => {
      const eff = getEffectiveSubcontractor(w, workersById);
      if (eff) map.set(eff.id, eff.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [workers, workersById]);

  // רשימת מנהלי עבודה — כל העובדים שמוגדרים כמנהל
  const siteManagers = useMemo(() => {
    return workers
      .filter((w) => w.is_responsible_site_manager)
      .map((w) => ({ id: w.id, name: w.full_name }));
  }, [workers]);

  // נתוני מנהל/קבלן נבחר להצגת ה-header
  const selectedManagerWorker = useMemo(
    () => (managerFilter ? workers.find((w) => w.id === managerFilter) ?? null : null),
    [workers, managerFilter]
  );
  const selectedSubcontractor = useMemo(
    () => (subcontractorFilter ? subcontractors.find((s) => s.id === subcontractorFilter) ?? null : null),
    [subcontractors, subcontractorFilter]
  );

  const filtered = useMemo(() => {
    return workers.filter((w) => {
      if (!showInactive && w.is_active === false) return false;
      const matchesSearch =
        !search ||
        w.full_name.includes(search) ||
        (w.national_id ?? '').includes(search) ||
        (w.passport_number ?? '').includes(search);
      const status = getWorkerStatus(w);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'expired' ? (status === 'expired' || status === 'missing') : status === filter);
      // סינון קבלן: על בסיס קבלן אפקטיבי (ישיר או בירושה)
      const matchesSub = !subcontractorFilter || (() => {
        const eff = getEffectiveSubcontractor(w, workersById);
        return eff?.id === subcontractorFilter;
      })();
      // מנהל עבודה: הצג עובדים משויכים, אך לא את המנהל עצמו (הוא מוצג כ-header)
      const matchesManager = !managerFilter || (w.responsible_manager_id === managerFilter && w.id !== managerFilter);
      return matchesSearch && matchesFilter && matchesSub && matchesManager;
    });
  }, [workers, workersById, search, filter, showInactive, subcontractorFilter, managerFilter]);

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

  // כמה עובדים פעילים משויכים לכל גורם (כולל ירושה בקבלן)
  const managerWorkerCount = managerFilter
    ? workers.filter((w) => w.responsible_manager_id === managerFilter && w.is_active !== false && w.id !== managerFilter).length
    : 0;
  const subWorkerCount = subcontractorFilter
    ? workers.filter((w) => {
        if (w.is_active === false) return false;
        const eff = getEffectiveSubcontractor(w, workersById);
        return eff?.id === subcontractorFilter;
      }).length
    : 0;

  if (loading && workers.length === 0) return (
    <div className="space-y-3 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 bg-gray-100 rounded-xl" />
      ))}
    </div>
  );

  if (!isOnline && workers.length === 0) return (
    <div className="text-center py-16 text-gray-400 text-sm">אין נתונים שמורים להצגה במצב לא מקוון</div>
  );

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
        <div className="flex items-center gap-2">
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
          {isOnline && (
            <Link
              href="/workers/new"
              className="bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors whitespace-nowrap"
            >
              + עובד חדש
            </Link>
          )}
        </div>
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
              className={`text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 transition-colors ${
                subcontractorFilter ? 'border-green-400 text-green-800 font-medium' : 'border-gray-200'
              }`}
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
              className={`text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${
                managerFilter ? 'border-blue-400 text-blue-800 font-medium' : 'border-gray-200'
              }`}
            >
              <option value="">כל מנהלי העבודה</option>
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

      {/* Header — מנהל עבודה נבחר */}
      {selectedManagerWorker && (
        <ManagerFilterHeader
          manager={selectedManagerWorker}
          workerCount={managerWorkerCount}
          photoUrl={undefined}
          onClear={() => setManagerFilter('')}
        />
      )}

      {/* Header — קבלן משנה נבחר */}
      {selectedSubcontractor && (
        <SubcontractorFilterHeader
          name={selectedSubcontractor.name}
          workerCount={subWorkerCount}
          onClear={() => setSubcontractorFilter('')}
        />
      )}

      {/* רשימה */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-base font-medium">
            {search || filter !== 'all' || managerFilter || subcontractorFilter
              ? 'לא נמצאו עובדים התואמים את החיפוש'
              : 'אין עובדים במערכת עדיין'}
          </p>
          {managerFilter && !selectedManagerWorker && (
            <p className="text-sm mt-1">לא שויכו עובדים למנהל עבודה זה</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((worker) => (
            <WorkerCard
              key={worker.id}
              worker={worker}
              photoUrl={undefined}
              effectiveSub={getEffectiveSubcontractor(worker, workersById)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Header: מנהל עבודה נבחר ──────────────────────────────────
function ManagerFilterHeader({
  manager,
  workerCount,
  photoUrl,
  onClear,
}: {
  manager: WorkerWithDocuments;
  workerCount: number;
  photoUrl?: string;
  onClear: () => void;
}) {
  const status = getWorkerStatus(manager);

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
            מנהל עבודה
          </span>
          <span className="text-xs text-blue-500">{workerCount} עובדים משויכים</span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-blue-400 hover:text-blue-600 border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-100 transition-colors"
        >
          נקה סינון ✕
        </button>
      </div>
      <Link href={`/workers/${manager.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
        <div className="w-12 h-12 rounded-full bg-blue-200 flex items-center justify-center font-bold text-blue-800 text-lg overflow-hidden flex-shrink-0">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={manager.full_name} className="w-12 h-12 object-cover" />
          ) : (
            manager.full_name.charAt(0)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-blue-900 text-base">{manager.full_name}</p>
          <p className="text-sm text-blue-600">
            {manager.is_foreign_worker ? 'דרכון' : 'ת.ז.'} {getWorkerIdentifierValue(manager)}
            {manager.phone && <span dir="ltr"> · {manager.phone}</span>}
          </p>
        </div>
        <StatusBadge status={status} size="sm" />
      </Link>
      {workerCount > 0 && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          <p className="text-xs text-blue-500 font-medium">עובדים כפופים:</p>
        </div>
      )}
    </div>
  );
}

// ─── Header: קבלן משנה נבחר ───────────────────────────────────
function SubcontractorFilterHeader({
  name,
  workerCount,
  onClear,
}: {
  name: string;
  workerCount: number;
  onClear: () => void;
}) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-200 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-green-900 text-base">{name}</p>
              <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">
                קבלן משנה
              </span>
            </div>
            <p className="text-sm text-green-600">{workerCount} עובדים משויכים</p>
          </div>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-green-400 hover:text-green-600 border border-green-200 rounded-lg px-2 py-1 hover:bg-green-100 transition-colors"
        >
          נקה סינון ✕
        </button>
      </div>
      {workerCount > 0 && (
        <div className="mt-3 pt-3 border-t border-green-200">
          <p className="text-xs text-green-500 font-medium">עובדי הקבלן:</p>
        </div>
      )}
    </div>
  );
}

function WorkerCard({
  worker,
  photoUrl,
  effectiveSub,
}: {
  worker: WorkerWithDocuments;
  photoUrl?: string;
  effectiveSub?: EffectiveSubcontractor | null;
}) {
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
      setIsActive((v) => !v);
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
            {worker.is_foreign_worker ? 'דרכון' : 'ת.ז.'} {getWorkerIdentifierValue(worker)} · {worker.is_foreign_worker ? 'עובד זר' : 'ישראלי'}
            {effectiveSub && (
              <>
                {' · '}
                <span className={effectiveSub.source === 'via-manager' ? 'text-blue-400' : ''}>
                  {effectiveSub.name}
                </span>
                {effectiveSub.source === 'via-manager' && (
                  <span className="text-xs text-blue-300 mr-0.5"> (דרך {effectiveSub.managerName})</span>
                )}
              </>
            )}
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
