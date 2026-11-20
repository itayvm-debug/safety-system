'use client';

/**
 * Gate check: type a name, ID or passport number → one clear answer per worker.
 * Same data as the workers list (/api/workers, offline snapshot 'workers'); the verdict comes
 * from the shared status engine via lib/workers/entry-check.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { WorkerWithDocuments } from '@/types';
import { loadSnapshot, saveSnapshot } from '@/lib/offline/cache';
import { getPhotoUrl } from '@/lib/storage/photo-url-client';
import { getEffectiveSubcontractor } from '@/lib/workers/subcontractor';
import { checkEntry, matchesWorker, sortForGate, type EntryCheck, type EntryVerdict } from '@/lib/workers/entry-check';

const MAX_RESULTS = 20;

const VERDICT_UI: Record<EntryVerdict, { label: string; icon: string; box: string; text: string }> = {
  allowed:          { label: 'מורשה לעבוד', icon: '✓', box: 'bg-green-50 border-green-300', text: 'text-green-800' },
  allowed_expiring: { label: 'מורשה לעבוד — יש מסמכים שיפוגו בקרוב', icon: '✓', box: 'bg-green-50 border-amber-300', text: 'text-green-800' },
  not_allowed:      { label: 'לא מורשה לעבוד', icon: '✗', box: 'bg-red-50 border-red-300', text: 'text-red-800' },
  inactive:         { label: 'העובד מסומן כלא פעיל', icon: '–', box: 'bg-gray-50 border-gray-300', text: 'text-gray-700' },
};

export default function EntryCheckScreen() {
  const [workers, setWorkers] = useState<WorkerWithDocuments[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const cached = loadSnapshot<WorkerWithDocuments[]>('workers');
      if (cached && active) { setWorkers(cached); setFromCache(true); setLoading(false); }
      if (!navigator.onLine) { if (active) setLoading(false); return; }
      try {
        const res = await fetch('/api/workers');
        if (!res.ok) throw new Error(String(res.status));
        const data: WorkerWithDocuments[] = await res.json();
        if (!active) return;
        setWorkers(data); setFromCache(false); setLoadError(''); saveSnapshot('workers', data);
      } catch {
        if (active) setLoadError(cached ? '' : 'לא ניתן לטעון את רשימת העובדים. בדוק חיבור ונסה שוב.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const workersById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    return workers
      .filter((w) => matchesWorker(w, query))
      .map((worker) => ({ worker, check: checkEntry(worker) }))
      .sort(sortForGate);
  }, [workers, query]);

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900">בדיקת כניסה לאתר</h1>
      <p className="mt-1 text-sm text-gray-600">מי מורשה לעבוד היום — חפש לפי שם, תעודת זהות, דרכון או טלפון.</p>

      <label htmlFor="entry-check-query" className="sr-only">חיפוש עובד</label>
      <input
        id="entry-check-query"
        type="search"
        autoFocus
        autoComplete="off"
        enterKeyHint="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="שם, ת״ז או דרכון…"
        className="mt-4 w-full rounded-xl border border-gray-300 px-4 py-3 text-lg focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
      />

      {fromCache && !loading && (
        <p className="mt-2 text-xs text-amber-700" role="status">מוצגים נתונים שמורים במכשיר (אין חיבור או שהטעינה עדיין רצה).</p>
      )}
      {loadError && <p className="mt-3 text-sm text-red-700" role="alert">{loadError}</p>}
      {loading && workers.length === 0 && <p className="mt-6 text-center text-gray-500">טוען עובדים…</p>}

      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="mt-6 text-center text-gray-600">לא נמצא עובד בשם או במספר הזה.</p>
      )}
      {query.trim().length > 0 && query.trim().length < 2 && (
        <p className="mt-4 text-sm text-gray-500">הקלד לפחות 2 תווים.</p>
      )}

      <ul className="mt-4 space-y-3" aria-live="polite">
        {results.slice(0, MAX_RESULTS).map(({ worker, check }) => (
          <EntryCard
            key={worker.id}
            worker={worker}
            check={check}
            subcontractor={getEffectiveSubcontractor(worker, workersById)?.name ?? null}
          />
        ))}
      </ul>
      {results.length > MAX_RESULTS && (
        <p className="mt-3 text-sm text-gray-500">מוצגים {MAX_RESULTS} מתוך {results.length} — צמצם את החיפוש.</p>
      )}
    </div>
  );
}

function EntryCard({ worker, check, subcontractor }: { worker: WorkerWithDocuments; check: EntryCheck; subcontractor: string | null }) {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getPhotoUrl(worker.photo_url).then((url) => { if (!cancelled) setPhoto(url); });
    return () => { cancelled = true; };
  }, [worker.photo_url]);

  const ui = VERDICT_UI[check.verdict];
  const idLabel = worker.is_foreign_worker ? 'דרכון' : 'ת״ז';
  const idValue = worker.is_foreign_worker ? worker.passport_number : (worker.national_id ?? worker.id_number);

  return (
    <li className={`rounded-xl border-2 p-4 ${ui.box}`} data-verdict={check.verdict}>
      <div className="flex items-start gap-3">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, not optimizable
          <img src={photo} alt={`תמונת ${worker.full_name}`} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white text-2xl text-gray-400" aria-hidden="true">👷</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-gray-900">{worker.full_name}</p>
          <p className="text-sm text-gray-600">
            {idValue ? `${idLabel} ${idValue}` : `${idLabel} לא הוזן`}
            {subcontractor ? ` · ${subcontractor}` : ''}
            {worker.profession ? ` · ${worker.profession}` : ''}
          </p>
        </div>
      </div>

      <p className={`mt-3 text-xl font-bold ${ui.text}`}>
        <span aria-hidden="true">{ui.icon} </span>{ui.label}
      </p>

      {check.reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pr-5 text-sm text-red-800">
          {check.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      {check.expiring.length > 0 && (
        <p className="mt-2 text-sm text-amber-800">יפוג בקרוב (עד 14 יום): {check.expiring.join(', ')}</p>
      )}

      <Link href={`/workers/${worker.id}`} className="mt-3 inline-block text-sm font-semibold text-orange-700 underline">
        לכרטיס העובד
      </Link>
    </li>
  );
}
