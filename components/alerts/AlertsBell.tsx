'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { Issue } from '@/lib/documents/issues';

const ENTITY_LABELS: Record<Issue['entityType'], string> = {
  worker: 'עובד',
  vehicle: 'רכב',
  heavy_equipment: 'כלי צמ"ה',
  lifting_equipment: 'ציוד הרמה',
};

const STATUS_LABELS: Record<Issue['status'], string> = {
  expired: 'פג תוקף',
  missing: 'חסר',
  expiring_soon: 'עומד לפוג',
};

const STORAGE_KEY = 'safedoc_read_alerts';

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function saveReadIds(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage unavailable — ignore
  }
}

export default function AlertsBell() {
  const [alerts, setAlerts] = useState<Issue[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReadIds(getReadIds());
    fetch('/api/alerts')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => setAlerts(Array.isArray(data) ? (data as Issue[]) : []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveReadIds(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const a of alerts) next.add(a.id);
      saveReadIds(next);
      return next;
    });
  }, [alerts]);

  const unreadCount = alerts.filter((a) => !readIds.has(a.id)).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label="התראות"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">התראות</span>
              {!loading && alerts.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                  {alerts.length}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-orange-500 hover:text-orange-700 transition-colors font-medium"
              >
                סמן הכל כנקרא
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
            {loading && (
              <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                טוען...
              </div>
            )}

            {!loading && alerts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm">אין התראות פעילות</span>
              </div>
            )}

            {!loading && alerts.map((alert) => {
              const isRead = readIds.has(alert.id);
              const isUrgent = alert.status === 'expired' || alert.status === 'missing';

              return (
                <div
                  key={alert.id}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${isRead ? '' : 'bg-orange-50/50'}`}
                >
                  <div className={`mt-2 w-2 h-2 rounded-full shrink-0 ${isUrgent ? 'bg-red-500' : 'bg-yellow-400'}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] text-gray-400 font-medium">
                        {ENTITY_LABELS[alert.entityType]}
                      </span>
                      <span className="text-[10px] text-gray-300">·</span>
                      <span className={`text-[10px] font-semibold ${isUrgent ? 'text-red-600' : 'text-yellow-600'}`}>
                        {STATUS_LABELS[alert.status]}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{alert.entityName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{alert.problem}</p>
                  </div>

                  <Link
                    href={alert.href}
                    onClick={() => { markRead(alert.id); setOpen(false); }}
                    className="shrink-0 text-xs text-orange-500 hover:text-orange-700 font-medium px-2 py-1 rounded hover:bg-orange-50 transition-colors mt-1 whitespace-nowrap"
                  >
                    פתח ←
                  </Link>
                </div>
              );
            })}
          </div>

          {!loading && alerts.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-2.5 text-center">
              <Link
                href="/issues"
                onClick={() => setOpen(false)}
                className="text-xs text-orange-500 hover:text-orange-700 font-medium transition-colors"
              >
                צפה בכל הליקויים →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
