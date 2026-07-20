'use client';

import { useEffect, useState } from 'react';

interface HealthCheck { status: 'ok' | 'error'; detail?: string; }

interface SystemHealth {
  status: 'ok' | 'degraded';
  version: string;
  timestamp: string;
  legalVersions: {
    terms: string;
    privacy: string;
    accessibility: string;
    effectiveDate: string;
  };
  features: Record<string, boolean>;
  checks: Record<string, HealthCheck>;
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {ok ? 'תקין' : 'שגיאה'}
    </span>
  );
}

export default function SystemHealthPage() {
  const [data, setData] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshed, setRefreshed] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/system-health', { cache: 'no-store' });
      if (res.ok) {
        setData(await res.json());
        setRefreshed(new Date());
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-3xl mx-auto py-10 px-4" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">מצב מערכת</h1>
        <button onClick={load} disabled={loading}
          className="text-sm text-orange-600 hover:text-orange-700 disabled:opacity-50 font-medium">
          {loading ? 'טוען...' : 'רענן'}
        </button>
      </div>

      {refreshed && (
        <p className="text-xs text-gray-400 mb-4">
          עודכן: {refreshed.toLocaleTimeString('he-IL')}
        </p>
      )}

      {data ? (
        <div className="space-y-6">
          {/* Overall status */}
          <div className="rounded-xl border p-4 flex items-center justify-between bg-white shadow-sm">
            <div>
              <p className="text-sm text-gray-500">סטטוס כללי</p>
              <p className="font-semibold text-gray-900">גרסה {data.version}</p>
            </div>
            <StatusBadge ok={data.status === 'ok'} />
          </div>

          {/* Service checks */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">בדיקות תשתית</h2>
            <div className="space-y-2">
              {Object.entries(data.checks).map(([key, check]) => (
                <div key={key} className="rounded-lg border p-3 flex items-center justify-between bg-white">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{key}</p>
                    {check.detail && <p className="text-xs text-gray-500 mt-0.5">{check.detail}</p>}
                  </div>
                  <StatusBadge ok={check.status === 'ok'} />
                </div>
              ))}
            </div>
          </div>

          {/* Legal versions */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">גרסאות משפטיות</h2>
            <div className="rounded-lg border divide-y bg-white">
              {Object.entries(data.legalVersions).map(([k, v]) => (
                <div key={k} className="px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-gray-600">{k}</span>
                  <span className="font-mono text-gray-900">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Features */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">פיצ&apos;רים ודגלים</h2>
            <div className="rounded-lg border divide-y bg-white">
              {Object.entries(data.features).map(([k, v]) => (
                <div key={k} className="px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-gray-600 font-mono text-xs">{k}</span>
                  <StatusBadge ok={Boolean(v)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">טוען נתוני מערכת...</p>
      )}
    </div>
  );
}
