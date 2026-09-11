'use client';

import { useState } from 'react';
import Link from 'next/link';
import { weekLabel } from '@/lib/reviews/week';
import { generateReviewReportHtml, type ReviewReportRow, type ReviewScope } from '@/lib/reviews/generateReviewReport';

interface Props {
  companyId: string;
  companyName: string;
  currentWeek: string;
  previousWeek: string;
  managers: { id: string; full_name: string }[];
  workers:  { id: string; full_name: string }[];
}

export default function ReviewReportsClient({ companyName, currentWeek, previousWeek, managers, workers }: Props) {
  const [scope,     setScope]     = useState<ReviewScope>('company');
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [managerId, setManagerId] = useState('');
  const [workerId,  setWorkerId]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  function scopeLabel(): string {
    if (scope === 'company') return 'כלל החברה';
    if (scope === 'manager') {
      const m = managers.find(x => x.id === managerId);
      return m ? `מנהל: ${m.full_name}` : 'לפי מנהל';
    }
    const w = workers.find(x => x.id === workerId);
    return w ? `עובד: ${w.full_name}` : 'לפי עובד';
  }

  async function handleDownload() {
    if (scope === 'manager' && !managerId) { setError('בחר מנהל'); return; }
    if (scope === 'individual' && !workerId) { setError('בחר עובד'); return; }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ week_start: weekStart, scope });
      if (scope === 'manager' && managerId) params.set('manager_id', managerId);
      if (scope === 'individual' && workerId) params.set('worker_id', workerId);

      const res = await fetch(`/api/reviews/report?${params}`);
      const data = await res.json() as { rows?: ReviewReportRow[]; error?: string };
      if (!res.ok || !data.rows) { setError(data.error ?? 'שגיאה בטעינת הנתונים'); return; }

      const html = generateReviewReportHtml(data.rows, { companyName, logoUrl: null }, weekStart, scope, scopeLabel());
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.print();
      }
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/reviews" className="text-sm text-orange-600 hover:underline">← חזור</Link>
        <h1 className="text-xl font-bold text-gray-900">דוחות ביצועים</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
        {/* Week selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">שבוע</label>
          <select
            value={weekStart}
            onChange={e => setWeekStart(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value={currentWeek}>{weekLabel(currentWeek)} (שוטף)</option>
            <option value={previousWeek}>{weekLabel(previousWeek)} (קודם)</option>
          </select>
        </div>

        {/* Scope selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">היקף הדוח</label>
          <div className="flex gap-2">
            {(['company', 'manager', 'individual'] as ReviewScope[]).map(s => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                  scope === s
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {{ company: 'כלל החברה', manager: 'לפי מנהל', individual: 'לפי עובד' }[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Conditional sub-filter */}
        {scope === 'manager' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מנהל אתר</label>
            <select
              value={managerId}
              onChange={e => setManagerId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="">— בחר מנהל —</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
        )}
        {scope === 'individual' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">עובד</label>
            <select
              value={workerId}
              onChange={e => setWorkerId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="">— בחר עובד —</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
            </select>
          </div>
        )}

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <button
          onClick={handleDownload}
          disabled={loading}
          className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg disabled:opacity-50 transition-colors text-sm"
        >
          {loading ? 'מכין דוח...' : 'הורד דוח PDF'}
        </button>
      </div>
    </div>
  );
}
