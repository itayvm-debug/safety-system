'use client';

/**
 * Group safety briefing: choose workers → instructor + languages → show the template once per
 * language → each worker signs on this device in turn → one signed PDF + record per worker.
 * Logic: lib/briefings/group.ts; PDF/upload/record: lib/briefings/system-briefing.ts (the same
 * code as the single-worker briefing).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import TemplateViewer from '@/components/documents/TemplateViewer';
import SignaturePad from '@/components/documents/SignaturePad';
import StatusBadge from '@/components/StatusBadge';
import { BRIEFING_ACKNOWLEDGMENT, BRIEFING_LANGUAGE_LABELS, type BriefingLanguage, type WorkerWithDocuments } from '@/types';
import { getPhotoUrl } from '@/lib/storage/photo-url-client';
import { fetchBriefingTemplateUrl, RateLimitedError, saveSystemBriefing } from '@/lib/briefings/system-briefing';
import {
  briefingCandidates, briefingStatusOf, languagesInOrder, lastBriefingLanguage, nextToSign, summarize,
  type Participant, type SaveState, type SignState,
} from '@/lib/briefings/group';

type Step = 'select' | 'setup' | 'present' | 'sign' | 'save';
const LANGS = Object.entries(BRIEFING_LANGUAGE_LABELS) as [BriefingLanguage, string][];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function GroupBriefingFlow() {
  const [step, setStep] = useState<Step>('select');
  const [workers, setWorkers] = useState<WorkerWithDocuments[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // select
  const [query, setQuery] = useState('');
  const [onlyNeeding, setOnlyNeeding] = useState(true);
  const [subcontractorId, setSubcontractorId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // setup
  const [conductedBy, setConductedBy] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState<BriefingLanguage | ''>('');
  const [languageOf, setLanguageOf] = useState<Record<string, BriefingLanguage | undefined>>({});
  const [templates, setTemplates] = useState<Partial<Record<BriefingLanguage, string>>>({});
  const [setupError, setSetupError] = useState('');
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // present / sign / save
  const [presentIndex, setPresentIndex] = useState(0);
  const [signs, setSigns] = useState<Record<string, SignState>>({});
  const [currentSignature, setCurrentSignature] = useState('');
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  const [savingRun, setSavingRun] = useState(false);
  const [waitNotice, setWaitNotice] = useState('');
  const startedSave = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/workers');
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as WorkerWithDocuments[];
        if (active) setWorkers(data);
      } catch {
        if (active) setLoadError('לא ניתן לטעון עובדים. תדריך קבוצתי דורש חיבור לאינטרנט.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const byId = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const subcontractors = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workers) if (w.subcontractor_id && w.subcontractor) m.set(w.subcontractor_id, w.subcontractor.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'he'));
  }, [workers]);
  const candidates = useMemo(
    () => briefingCandidates(workers, { query, onlyNeeding, subcontractorId: subcontractorId || undefined }),
    [workers, query, onlyNeeding, subcontractorId],
  );

  const order = useMemo(
    () => workers.filter((w) => selected.has(w.id)).sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')).map((w) => w.id),
    [workers, selected],
  );
  const participants: Participant[] = useMemo(
    () => order.map((id) => ({ workerId: id, language: (languageOf[id] ?? defaultLanguage) as BriefingLanguage })),
    [order, languageOf, defaultLanguage],
  );
  const languages = useMemo(() => languagesInOrder(participants.filter((p) => p.language)), [participants]);
  const stats = summarize(order, signs, saves);

  // Warn before leaving with signatures that are not saved yet
  useEffect(() => {
    if (!(step === 'sign' || step === 'save') || stats.unsaved === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [step, stats.unsaved]);

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function goToSetup() {
    const initial: Record<string, BriefingLanguage | undefined> = {};
    for (const id of order) initial[id] = languageOf[id] ?? lastBriefingLanguage(byId.get(id)!) ?? undefined;
    setLanguageOf(initial);
    setSetupError('');
    setStep('setup');
  }

  async function goToPresent() {
    if (!conductedBy.trim()) { setSetupError('יש להזין שם המדריך'); return; }
    if (participants.some((p) => !p.language)) { setSetupError('יש לבחור שפת ברירת מחדל או שפה לכל עובד'); return; }
    setSetupError('');
    setTemplatesLoading(true);
    try {
      const entries = await Promise.all(languages.map(async (l) => [l, await fetchBriefingTemplateUrl(l)] as const));
      setTemplates(Object.fromEntries(entries));
      setPresentIndex(0);
      setStep('present');
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'שגיאה בטעינת תבנית');
    } finally {
      setTemplatesLoading(false);
    }
  }

  const signIndex = nextToSign(order, signs);
  const signingId = signIndex >= 0 ? order[signIndex] : null;

  function confirmSignature() {
    if (!signingId || !currentSignature) return;
    setSigns((s) => ({ ...s, [signingId]: { kind: 'signed', signature: currentSignature } }));
    setCurrentSignature('');
  }
  function skipWorker() {
    if (!signingId) return;
    setSigns((s) => ({ ...s, [signingId]: { kind: 'skipped' } }));
    setCurrentSignature('');
  }
  function backToPrevious() {
    const upto = signIndex >= 0 ? signIndex : order.length;
    for (let i = upto - 1; i >= 0; i--) {
      const id = order[i];
      if (saves[id]?.kind === 'saved') return; // already recorded — do not re-sign
      setSigns((s) => ({ ...s, [id]: { kind: 'pending' } }));
      setCurrentSignature('');
      return;
    }
  }

  // All signed or skipped → save
  useEffect(() => {
    if (step === 'sign' && order.length > 0 && signIndex === -1) setStep('save');
  }, [step, signIndex, order.length]);

  async function saveAll(ids: string[]) {
    setSavingRun(true);
    for (const id of ids) {
      const sign = signs[id];
      const worker = byId.get(id);
      const language = participants.find((p) => p.workerId === id)?.language;
      if (sign?.kind !== 'signed' || !worker || !language) continue;
      for (;;) {
        setSaves((s) => ({ ...s, [id]: { kind: 'saving', status: 'מתחיל...' } }));
        try {
          const saved = await saveSystemBriefing(
            { worker, language, conductedBy: conductedBy.trim(), signatureDataUrl: sign.signature, templateUrl: templates[language]! },
            (status) => setSaves((s) => ({ ...s, [id]: { kind: 'saving', status } })),
          );
          setSaves((s) => ({ ...s, [id]: { kind: 'saved', briefingId: saved.id } }));
          break;
        } catch (e) {
          if (e instanceof RateLimitedError) {
            setWaitNotice(`הגעת למגבלת ההעלאות — ממתין ${e.retryAfterSec} שניות וממשיך לבד. אל תסגור את הדף.`);
            await sleep(e.retryAfterSec * 1000);
            setWaitNotice('');
            continue;
          }
          setSaves((s) => ({ ...s, [id]: { kind: 'failed', error: e instanceof Error ? e.message : String(e) } }));
          break;
        }
      }
    }
    setSavingRun(false);
  }

  useEffect(() => {
    if (step !== 'save' || startedSave.current) return;
    startedSave.current = true;
    void saveAll(order.filter((id) => signs[id]?.kind === 'signed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when the save step opens
  }, [step]);

  // ─── render ────────────────────────────────────────────────────────────────
  if (loading) return <p className="py-10 text-center text-gray-500">טוען עובדים…</p>;
  if (loadError) return <p className="py-10 text-center text-red-700" role="alert">{loadError}</p>;

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">תדריך בטיחות קבוצתי</h1>
        {step === 'select' && <Link href="/workers" className="text-sm text-gray-500 underline">ביטול</Link>}
      </div>
      <StepIndicator step={step} />

      {step === 'select' && (
        <section aria-label="בחירת עובדים">
          <p className="mb-3 text-sm text-gray-600">סמן את העובדים שמשתתפים בתדריך. כל עובד יחתום בתורו, ולכל אחד יישמר מסמך חתום משלו.</p>
          <label htmlFor="gb-search" className="sr-only">חיפוש עובד</label>
          <input id="gb-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם או ת״ז…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300" />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={onlyNeeding} onChange={(e) => setOnlyNeeding(e.target.checked)} />
              רק מי שצריך תדריך (חסר / פג / יפוג בקרוב)
            </label>
            {subcontractors.length > 0 && (
              <select aria-label="סינון לפי קבלן משנה" value={subcontractorId} onChange={(e) => setSubcontractorId(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1">
                <option value="">כל הקבלנים</option>
                {subcontractors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            )}
          </div>
          <div className="mt-3 flex gap-3 text-sm">
            <button type="button" className="text-orange-700 underline" onClick={() => setSelected((s) => new Set([...s, ...candidates.map((w) => w.id)]))}>
              סמן את כל המוצגים ({candidates.length})
            </button>
            {selected.size > 0 && <button type="button" className="text-gray-500 underline" onClick={() => setSelected(new Set())}>נקה בחירה</button>}
          </div>
          <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {candidates.length === 0 && <li className="p-4 text-center text-sm text-gray-500">אין עובדים פעילים שמתאימים לסינון.</li>}
            {candidates.map((w) => (
              <li key={w.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                  <input type="checkbox" className="h-5 w-5" checked={selected.has(w.id)} onChange={() => toggle(w.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-gray-900">{w.full_name}</span>
                    {w.subcontractor?.name && <span className="block text-xs text-gray-500">{w.subcontractor.name}</span>}
                  </span>
                  <StatusBadge status={briefingStatusOf(w)} size="sm" />
                </label>
              </li>
            ))}
          </ul>
          <div className="sticky bottom-0 mt-4 bg-white/95 py-3">
            <button type="button" disabled={selected.size === 0} onClick={goToSetup}
              className="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white disabled:opacity-40">
              {selected.size === 0 ? 'בחר עובדים' : `המשך עם ${selected.size} עובדים ←`}
            </button>
          </div>
        </section>
      )}

      {step === 'setup' && (
        <section aria-label="פרטי התדריך" className="space-y-4">
          <div>
            <label htmlFor="gb-instructor" className="mb-1 block text-sm font-medium text-gray-700">שם המדריך</label>
            <input id="gb-instructor" value={conductedBy} onChange={(e) => setConductedBy(e.target.value)} placeholder="שם מנהל העבודה / מנהל הבטיחות"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300" />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">שפת התדריך (לכל מי שלא נבחרה לו שפה)</p>
            <div className="grid grid-cols-3 gap-2">
              {LANGS.map(([key, label]) => (
                <button key={key} type="button" onClick={() => setDefaultLanguage(key)} aria-pressed={defaultLanguage === key}
                  className={`rounded-lg border py-2 text-sm font-medium ${defaultLanguage === key ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">משתתפים ({order.length}) — אפשר לשנות שפה לעובד מסוים</p>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {order.map((id) => (
                <li key={id} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-sm text-gray-900">{byId.get(id)?.full_name}</span>
                  <select aria-label={`שפה עבור ${byId.get(id)?.full_name}`} value={languageOf[id] ?? ''}
                    onChange={(e) => setLanguageOf((m) => ({ ...m, [id]: (e.target.value || undefined) as BriefingLanguage | undefined }))}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-sm">
                    <option value="">{defaultLanguage ? `ברירת מחדל (${BRIEFING_LANGUAGE_LABELS[defaultLanguage]})` : 'ברירת מחדל'}</option>
                    {LANGS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </div>
          {setupError && <p className="text-sm text-red-700" role="alert">{setupError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void goToPresent()} disabled={templatesLoading}
              className="flex-1 rounded-xl bg-orange-500 py-3 font-semibold text-white disabled:opacity-50">
              {templatesLoading ? 'טוען תבניות…' : 'המשך להצגת התדריך ←'}
            </button>
            <button type="button" onClick={() => setStep('select')} className="rounded-xl border border-gray-300 px-4">חזרה</button>
          </div>
        </section>
      )}

      {step === 'present' && languages[presentIndex] && templates[languages[presentIndex]] && (
        <section aria-label="הצגת התדריך">
          <p className="mb-2 text-sm text-gray-600">
            הצג את התדריך לקבוצה. {languages.length > 1 && `שפה ${presentIndex + 1} מתוך ${languages.length}.`}
          </p>
          <TemplateViewer
            key={languages[presentIndex]}
            title={`תדריך בטיחות — ${BRIEFING_LANGUAGE_LABELS[languages[presentIndex]]} (${participants.filter((p) => p.language === languages[presentIndex]).length} עובדים)`}
            src={templates[languages[presentIndex]]!}
            onContinue={() => (presentIndex + 1 < languages.length ? setPresentIndex(presentIndex + 1) : setStep('sign'))}
            onBack={() => (presentIndex > 0 ? setPresentIndex(presentIndex - 1) : setStep('setup'))}
          />
        </section>
      )}

      {step === 'sign' && signingId && (
        <SignStep
          key={signingId}
          worker={byId.get(signingId)!}
          language={participants[signIndex].language}
          position={signIndex + 1}
          total={order.length}
          hasSignature={!!currentSignature}
          onCapture={setCurrentSignature}
          onConfirm={confirmSignature}
          onSkip={skipWorker}
          onBack={signIndex > 0 ? backToPrevious : undefined}
        />
      )}

      {step === 'save' && (
        <section aria-label="שמירה" className="space-y-3">
          <p className="text-sm text-gray-700" role="status">
            {savingRun ? 'שומר את התדריכים — אל תסגור את הדף.' : stats.failed > 0 ? 'חלק מהתדריכים לא נשמרו.' : 'התדריך הקבוצתי הושלם.'}
          </p>
          {waitNotice && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="status">{waitNotice}</p>}
          <p className="text-sm text-gray-600">נשמרו {stats.saved} מתוך {stats.signed} חתימות{stats.skipped ? ` · ${stats.skipped} לא נכחו` : ''}</p>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {order.map((id) => {
              const sign = signs[id]?.kind;
              const save = saves[id];
              return (
                <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1 text-gray-900">{byId.get(id)?.full_name}</span>
                  {sign === 'skipped' && <span className="text-gray-500">לא נכח — לא נשמר</span>}
                  {sign === 'signed' && (!save || save.kind === 'waiting') && <span className="text-gray-500">ממתין…</span>}
                  {save?.kind === 'saving' && <span className="text-gray-600">{save.status}</span>}
                  {save?.kind === 'saved' && <span className="font-medium text-green-700">✓ נשמר</span>}
                  {save?.kind === 'failed' && <span className="text-red-700">✗ {save.error}</span>}
                </li>
              );
            })}
          </ul>
          {!savingRun && stats.failed > 0 && (
            <button type="button" onClick={() => void saveAll(order.filter((id) => saves[id]?.kind === 'failed'))}
              className="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white">
              נסה שוב לשמור את {stats.failed} שנכשלו
            </button>
          )}
          {!savingRun && stats.unsaved === 0 && (
            <Link href="/workers" className="block w-full rounded-xl border border-gray-300 py-3 text-center font-semibold text-gray-700">
              חזרה לרשימת העובדים
            </Link>
          )}
        </section>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: [Step, string][] = [['select', 'בחירה'], ['setup', 'פרטים'], ['present', 'תדריך'], ['sign', 'חתימות'], ['save', 'שמירה']];
  const current = steps.findIndex(([s]) => s === step);
  return (
    <ol className="mb-5 flex gap-1 text-xs" aria-label="שלבי התדריך">
      {steps.map(([s, label], i) => (
        <li key={s} aria-current={i === current ? 'step' : undefined}
          className={`flex-1 rounded-full py-1 text-center ${i < current ? 'bg-orange-100 text-orange-700' : i === current ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
          {label}
        </li>
      ))}
    </ol>
  );
}

function SignStep({
  worker, language, position, total, hasSignature, onCapture, onConfirm, onSkip, onBack,
}: {
  worker: WorkerWithDocuments;
  language: BriefingLanguage;
  position: number;
  total: number;
  hasSignature: boolean;
  onCapture: (dataUrl: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
  onBack?: () => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getPhotoUrl(worker.photo_url, 'thumb').then((u) => { if (!cancelled) setPhoto(u); });
    return () => { cancelled = true; };
  }, [worker.photo_url]);

  return (
    <section aria-label={`חתימת ${worker.full_name}`} className="space-y-4">
      <p className="text-sm text-gray-500">חתימה {position} מתוך {total} — העבר את המכשיר לעובד</p>
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL
          <img src={photo} alt={`תמונת ${worker.full_name}`} className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100 text-2xl text-gray-400" aria-hidden="true">👷</div>
        )}
        <div>
          <p className="text-xl font-bold text-gray-900">{worker.full_name}</p>
          <p className="text-sm text-gray-500">שפה: {BRIEFING_LANGUAGE_LABELS[language]}</p>
        </div>
      </div>
      <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-800" dir={language === 'hebrew' || language === 'arabic' ? 'rtl' : 'ltr'}>
        {BRIEFING_ACKNOWLEDGMENT[language]}
      </p>
      <div>
        <p className="mb-1 text-sm font-medium text-gray-700">חתימת העובד</p>
        <SignaturePad onCapture={onCapture} />
      </div>
      <button type="button" onClick={onConfirm} disabled={!hasSignature}
        className="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white disabled:opacity-40">
        {position < total ? 'אישור חתימה — לעובד הבא ←' : 'אישור חתימה — סיום ושמירה'}
      </button>
      <div className="flex justify-between text-sm">
        {onBack ? <button type="button" onClick={onBack} className="text-gray-500 underline">→ חזרה לעובד הקודם</button> : <span />}
        <button type="button" onClick={onSkip} className="text-gray-500 underline">דלג — העובד לא נוכח</button>
      </div>
    </section>
  );
}
