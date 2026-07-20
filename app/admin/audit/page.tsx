'use client';

import { useState, useEffect, useCallback } from 'react';

interface AuditLog {
  id: string;
  created_at: string;
  user_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
}

interface LogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

export default function AuditPage() {
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        ...(search && { search }),
        ...(action && { action }),
        ...(from && { from }),
        ...(to && { to }),
      });
      const res = await fetch(`/api/admin/audit?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [page, search, action, from, to]);

  useEffect(() => { load(); }, [load]);

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">לוג פעולות (Audit Log)</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {data?.total ?? '–'} רשומות סה&quot;כ
        </p>
      </div>

      {/* סינון */}
      <form onSubmit={handleFilter} className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש (מייל, פעולה, ID...)"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          <option value="">כל הפעולות</option>
          <option value="login">login</option>
          <option value="logout">logout</option>
          <option value="worker.create">worker.create</option>
          <option value="worker.update">worker.update</option>
          <option value="worker.archive">worker.archive</option>
          <option value="document.upload">document.upload</option>
          <option value="export.generate">export.generate</option>
          <option value="legal_consent.accept">legal_consent.accept</option>
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="מתאריך"
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="עד תאריך"
          />
          <button type="submit" className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600">
            סנן
          </button>
        </div>
      </form>

      {/* טבלה */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm animate-pulse">טוען...</div>
        ) : !data?.logs.length ? (
          <div className="p-8 text-center text-gray-400 text-sm">אין רשומות</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600">תאריך</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600">משתמש</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600">פעולה</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600">ישות</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600">IP</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600">מטא-דאטה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-4 text-gray-500 whitespace-nowrap" dir="ltr">
                      {new Date(log.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-2.5 px-4 text-gray-700">{log.user_email ?? '–'}</td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        log.action.startsWith('worker') ? 'bg-blue-100 text-blue-700' :
                        log.action.startsWith('vehicle') ? 'bg-orange-100 text-orange-700' :
                        log.action === 'login' ? 'bg-green-100 text-green-700' :
                        log.action === 'export.generate' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-gray-500 text-xs">
                      {log.entity_type && <span>{log.entity_type}</span>}
                      {log.entity_id && <span className="ml-1 font-mono">{log.entity_id.slice(0, 8)}…</span>}
                    </td>
                    <td className="py-2.5 px-4 text-gray-400 text-xs font-mono" dir="ltr">
                      {log.ip_address ?? '–'}
                    </td>
                    <td className="py-2.5 px-4 text-gray-400 text-xs max-w-xs truncate">
                      {log.metadata ? JSON.stringify(log.metadata) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            ← קודם
          </button>
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            הבא →
          </button>
        </div>
      )}
    </div>
  );
}
