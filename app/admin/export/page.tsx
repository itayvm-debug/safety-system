'use client';

import { useState } from 'react';

export default function ExportPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleExport() {
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch('/api/admin/export');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `שגיאה ${res.status}`);
      }
      // Trigger browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? 'safedoc-export.zip';

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">ייצוא נתונים</h1>
      <p className="text-gray-600 text-sm mb-8">
        ייצוא מלא של כל נתוני המערכת כקובץ ZIP. הקובץ מכיל קבצי JSONL לכל טבלה, קובץ manifest.json
        עם checksums ומטה-דאטה, ומתאים לגיבוי ידני או מעבר מערכת.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 mb-6">
        <strong>שים לב:</strong> הקובץ מכיל מידע אישי רגיש. יש לשמור אותו במקום מאובטח ולמחוק
        עותקים שאינם נחוצים.
      </div>

      <button
        onClick={handleExport}
        disabled={loading}
        className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-medium py-2.5 px-6 rounded-lg transition-colors"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            מייצא...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12v6m0 0l-3-3m3 3l3-3M12 4v8" />
            </svg>
            הורד ייצוא ZIP
          </>
        )}
      </button>

      {done && (
        <p className="mt-4 text-green-700 text-sm font-medium">
          הייצוא הושלם בהצלחה. הקובץ הורד לתיקיית ההורדות שלך.
        </p>
      )}
      {error && (
        <p className="mt-4 text-red-600 text-sm font-medium">שגיאה: {error}</p>
      )}

      <section className="mt-10 border-t pt-6 text-sm text-gray-500">
        <h2 className="text-gray-700 font-semibold mb-2">תוכן הקובץ</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>manifest.json — מטה-דאטה, גרסאות, ו-SHA-256 לכל קובץ</li>
          <li>workers.jsonl, documents.jsonl, vehicles.jsonl, ...</li>
          <li>כל הטבלאות העסקיות (16 קבצים)</li>
        </ul>
      </section>
    </div>
  );
}
