'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LiftingEquipment } from '@/types';
import { getLiftingEquipmentStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';
import ToggleSwitch from '@/components/ToggleSwitch';
import { saveSnapshot, loadSnapshot } from '@/lib/offline/cache';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

function LiftingEquipmentRow({ eq: initialEq }: { eq: LiftingEquipment }) {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [eq, setEq] = useState(initialEq);
  const [toggling, setToggling] = useState(false);
  const status = getLiftingEquipmentStatus(eq);
  const isInactive = !eq.is_active;
  const leftBorder: Record<string, string> = {
    valid: 'border-r-green-500', expiring_soon: 'border-r-yellow-500',
    expired: 'border-r-red-500', missing: 'border-r-red-500', not_required: 'border-r-gray-300',
  };

  async function handleToggle() {
    setToggling(true);
    setEq((prev) => ({ ...prev, is_active: !prev.is_active }));
    try {
      const res = await fetch(`/api/lifting-equipment/${eq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !eq.is_active }),
      });
      const data = await res.json();
      if (res.ok) { setEq(data); router.refresh(); }
      else setEq((prev) => ({ ...prev, is_active: !prev.is_active }));
    } catch {
      setEq((prev) => ({ ...prev, is_active: !prev.is_active }));
    } finally {
      setToggling(false);
    }
  }

  return (
    <Link href={`/lifting-equipment/${eq.id}`}
      className={`flex items-center justify-between bg-white rounded-xl border border-gray-100 border-r-4 ${leftBorder[status]} px-4 py-3.5 hover:shadow-md transition-all ${isInactive ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-gray-900 truncate">{eq.description}</p>
          {isInactive && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">לא פעיל</span>}
        </div>
        <p className="text-sm text-gray-400">
          {eq.subcontractor?.name}
          {eq.subcontractor?.name && eq.project_name && ' · '}
          {eq.project_name}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0 mr-2">
        {!isInactive && <StatusBadge status={status} size="sm" />}
        <ToggleSwitch checked={eq.is_active} onChange={handleToggle} disabled={toggling || !isOnline} />
        <svg className="w-4 h-4 text-gray-300 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

export default function LiftingEquipmentList() {
  const [equipment, setEquipment] = useState<LiftingEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const isOnline = useOnlineStatus();

  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const cached = loadSnapshot<LiftingEquipment[]>('lifting_equipment');
      if (cached && active) { setEquipment(cached); setLoading(false); }

      if (!navigator.onLine) { if (active) setLoading(false); return; }

      try {
        const res = await fetch('/api/lifting-equipment');
        if (!res.ok) throw new Error('fetch failed');
        const data: LiftingEquipment[] = await res.json();
        if (active) {
          setEquipment(data); setLoading(false); saveSnapshot('lifting_equipment', data);
        }
      } catch { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    return equipment.filter((e) => {
      if (!showInactive && !e.is_active) return false;
      return !search || e.description.includes(search);
    });
  }, [equipment, showInactive, search]);

  const activeCount = equipment.filter((e) => e.is_active).length;
  const inactiveCount = equipment.length - activeCount;

  if (loading && equipment.length === 0) return (
    <div className="space-y-3 animate-pulse">
      {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
    </div>
  );

  if (!loading && equipment.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        {!isOnline
          ? <p className="text-base font-medium">אין נתונים שמורים להצגה במצב לא מקוון</p>
          : <><p className="text-base font-medium">אין ציוד הרמה רשום עדיין</p>
              <p className="text-sm mt-1">ניהול ציוד הרמה כגון חגורות, שאקלים, שרשראות ועוד</p></>
        }
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {activeCount} פעילים{inactiveCount > 0 && ` · ${inactiveCount} לא פעילים`}
        </p>
        {inactiveCount > 0 && (
          <button onClick={() => setShowInactive((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-full border bg-white text-gray-500 border-gray-200 hover:border-gray-300">
            {showInactive ? 'הסתר לא פעילים' : 'הצג לא פעילים'}
          </button>
        )}
      </div>

      <div className="relative">
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי תיאור..."
          className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 shadow-sm" />
      </div>

      <div className="space-y-2">
        {filtered.map((eq) => (
          <LiftingEquipmentRow key={eq.id} eq={eq} />
        ))}
      </div>
    </div>
  );
}
