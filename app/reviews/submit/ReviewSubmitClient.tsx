'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { weekLabel } from '@/lib/reviews/week';

type Worker = { id: string; full_name: string; photo_url: string | null };

const RATING_FIELDS = [
  { key: 'productivity_rating', label: 'פרודוקטיביות' },
  { key: 'quality_rating',      label: 'איכות עבודה' },
  { key: 'reliability_rating',  label: 'אמינות' },
  { key: 'discipline_rating',   label: 'משמעת' },
  { key: 'teamwork_rating',     label: 'עבודת צוות' },
  { key: 'safety_rating',       label: 'בטיחות' },
] as const;

type RatingKey = (typeof RATING_FIELDS)[number]['key'];

type DraftReview = {
  worker_id: string;
  productivity_rating: number | null;
  quality_rating: number | null;
  reliability_rating: number | null;
  discipline_rating: number | null;
  teamwork_rating: number | null;
  safety_rating: number | null;
  is_not_evaluable: boolean;
  not_evaluable_reason: string | null;
  manager_comment: string | null;
};

function emptyDraft(workerId: string): DraftReview {
  return {
    worker_id: workerId,
    productivity_rating: null, quality_rating: null, reliability_rating: null,
    discipline_rating: null, teamwork_rating: null, safety_rating: null,
    is_not_evaluable: false, not_evaluable_reason: null, manager_comment: null,
  };
}

interface Props {
  workers: Worker[];
  weekStart: string;
  managerWorkerId: string;
  initialDrafts: DraftReview[];
}

export default function ReviewSubmitClient({ workers, weekStart, managerWorkerId, initialDrafts }: Props) {
  const router = useRouter();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, DraftReview>>(() => {
    const map: Record<string, DraftReview> = {};
    for (const w of workers) {
      const existing = initialDrafts.find(d => d.worker_id === w.id);
      map[w.id] = existing ?? emptyDraft(w.id);
    }
    return map;
  });

  const currentWorker = workers[currentIdx];
  const draft = drafts[currentWorker?.id] ?? emptyDraft(currentWorker?.id ?? '');
  const isLast = currentIdx === workers.length - 1;
  const isFirst = currentIdx === 0;

  const setRating = useCallback((key: RatingKey, val: number) => {
    setDrafts(prev => ({
      ...prev,
      [currentWorker.id]: { ...prev[currentWorker.id], [key]: val, is_not_evaluable: false },
    }));
  }, [currentWorker?.id]);

  const setNotEvaluable = useCallback((checked: boolean) => {
    setDrafts(prev => ({
      ...prev,
      [currentWorker.id]: {
        ...prev[currentWorker.id],
        is_not_evaluable: checked,
        ...(checked ? {
          productivity_rating: null, quality_rating: null, reliability_rating: null,
          discipline_rating: null, teamwork_rating: null, safety_rating: null,
        } : {}),
      },
    }));
  }, [currentWorker?.id]);

  const setComment = useCallback((val: string) => {
    setDrafts(prev => ({
      ...prev,
      [currentWorker.id]: { ...prev[currentWorker.id], manager_comment: val || null },
    }));
  }, [currentWorker?.id]);

  const setNotEvaluableReason = useCallback((val: string) => {
    setDrafts(prev => ({
      ...prev,
      [currentWorker.id]: { ...prev[currentWorker.id], not_evaluable_reason: val || null },
    }));
  }, [currentWorker?.id]);

  function isDraftComplete(d: DraftReview): boolean {
    if (d.is_not_evaluable) return true;
    return RATING_FIELDS.every(f => d[f.key] !== null);
  }

  async function saveDraft(workerId: string, submit: boolean) {
    const d = drafts[workerId];
    if (!d) return;
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...d,
          week_start: weekStart,
          evaluator_manager_id: managerWorkerId || undefined,
          submit,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'שגיאה בשמירה');
      }
    } catch (e) {
      throw e;
    }
  }

  async function handleNext() {
    if (!currentWorker) return;
    setSaving(true);
    setError('');
    try {
      await saveDraft(currentWorker.id, false);
      setCurrentIdx(i => i + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitAll() {
    setSubmitting(true);
    setError('');
    try {
      for (const w of workers) {
        const d = drafts[w.id];
        if (!d || !isDraftComplete(d)) {
          setError(`נא להשלים את הדירוג עבור ${w.full_name}`);
          setSubmitting(false);
          return;
        }
      }
      // Save current card first, then submit all
      await saveDraft(currentWorker.id, false);
      for (const w of workers) {
        await saveDraft(w.id, true);
      }
      setDone(true);
      router.push('/reviews');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בהגשה');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center" dir="rtl">
        <div className="text-5xl mb-4">✓</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">הביצועים הוגשו!</h2>
        <p className="text-sm text-gray-500">כל הדירוגים לשבוע {weekLabel(weekStart)} נשמרו.</p>
      </div>
    );
  }

  if (!currentWorker) return null;

  return (
    <div className="max-w-md mx-auto px-4 py-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-base font-bold text-gray-900">ביצועי עובדים</h1>
        <span className="text-xs text-gray-500">{currentIdx + 1} / {workers.length}</span>
      </div>

      {/* Progress */}
      <div className="h-1.5 bg-gray-100 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-orange-500 rounded-full transition-all"
          style={{ width: `${((currentIdx + 1) / workers.length) * 100}%` }}
        />
      </div>

      {/* Worker card */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 mb-4">
        {/* Worker info */}
        <div className="flex items-center gap-3 mb-5">
          {currentWorker.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentWorker.photo_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
              <span className="text-orange-600 font-bold">{currentWorker.full_name.charAt(0)}</span>
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-900">{currentWorker.full_name}</p>
            <p className="text-xs text-gray-500">{weekLabel(weekStart)}</p>
          </div>
        </div>

        {/* Not evaluable */}
        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.is_not_evaluable}
            onChange={e => setNotEvaluable(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-orange-500"
          />
          <span className="text-sm text-gray-700">לא ניתן להעריך עובד זה השבוע</span>
        </label>

        {draft.is_not_evaluable ? (
          <input
            type="text"
            placeholder="סיבה (אופציונלי)"
            value={draft.not_evaluable_reason ?? ''}
            onChange={e => setNotEvaluableReason(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 mb-4"
          />
        ) : (
          /* Rating rows */
          <div className="space-y-3 mb-4">
            {RATING_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">{label}</span>
                  {draft[key] && <span className="text-xs text-orange-600 font-bold">{draft[key]}/5</span>}
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button
                      key={v}
                      onClick={() => setRating(key, v)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        draft[key] === v
                          ? 'bg-orange-500 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Comment */}
        <textarea
          placeholder="הערת מנהל (אופציונלי)"
          rows={2}
          value={draft.manager_comment ?? ''}
          onChange={e => setComment(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
          aria-describedby="manager-comment-privacy-hint"
        />
        <p id="manager-comment-privacy-hint" className="mt-1 text-xs text-gray-400">
          הערה מקצועית בלבד — אין לכלול מידע אישי שאינו נדרש להערכת העבודה.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        {!isFirst && (
          <button
            onClick={() => setCurrentIdx(i => i - 1)}
            disabled={saving || submitting}
            className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            ← הקודם
          </button>
        )}

        {isLast ? (
          <button
            onClick={handleSubmitAll}
            disabled={submitting || saving || !isDraftComplete(draft)}
            className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'שולח...' : 'הגש הכל'}
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={saving || submitting || (!draft.is_not_evaluable && !isDraftComplete(draft))}
            className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'שומר...' : 'הבא →'}
          </button>
        )}
      </div>
    </div>
  );
}
