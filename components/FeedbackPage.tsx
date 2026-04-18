'use client';

import { useState } from 'react';
import { SiteFeedback } from '@/types';
import { formatDateSafe } from '@/lib/utils/date';

interface Props {
  feedbackList: SiteFeedback[];
}

export default function FeedbackPage({ feedbackList: initial }: Props) {
  const [list, setList] = useState<SiteFeedback[]>(initial);
  const [filterStarred, setFilterStarred] = useState(false);
  const [filterUnhandled, setFilterUnhandled] = useState(false);

  function update(updated: SiteFeedback) {
    setList((prev) => prev.map((fb) => fb.id === updated.id ? updated : fb));
  }

  function remove(id: string) {
    setList((prev) => prev.filter((fb) => fb.id !== id));
  }

  const filtered = list.filter((fb) => {
    if (filterStarred && !fb.is_starred) return false;
    if (filterUnhandled && fb.is_handled) return false;
    return true;
  });

  const starredCount = list.filter((fb) => fb.is_starred).length;
  const unhandledCount = list.filter((fb) => !fb.is_handled).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">פניות ומשובים</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {list.length} פניות · {unhandledCount} לא טופלו · {starredCount} מסומנות
          </p>
        </div>
      </div>

      {/* פילטרים */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilterUnhandled((v) => !v)}
          className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
            filterUnhandled
              ? 'bg-orange-500 text-white border-orange-500'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          לא טופלו ({unhandledCount})
        </button>
        <button
          onClick={() => setFilterStarred((v) => !v)}
          className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
            filterStarred
              ? 'bg-yellow-400 text-white border-yellow-400'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          ★ מסומנות ({starredCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-base font-medium">אין פניות להצגה</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((fb) => (
            <FeedbackCard key={fb.id} feedback={fb} onUpdated={update} onDeleted={remove} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackCard({
  feedback,
  onUpdated,
  onDeleted,
}: {
  feedback: SiteFeedback;
  onUpdated: (fb: SiteFeedback) => void;
  onDeleted: (id: string) => void;
}) {
  const [loading, setLoading] = useState<'star' | 'handle' | 'delete' | null>(null);

  async function patch(updates: Partial<SiteFeedback>) {
    try {
      const res = await fetch(`/api/site-feedback/${feedback.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (res.ok) onUpdated(data);
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete() {
    if (!confirm('למחוק את הפנייה? פעולה זו בלתי הפיכה.')) return;
    setLoading('delete');
    try {
      const res = await fetch(`/api/site-feedback/${feedback.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted(feedback.id);
    } finally {
      setLoading(null);
    }
  }

  async function toggleStar() {
    setLoading('star');
    await patch({ is_starred: !feedback.is_starred });
  }

  async function toggleHandled() {
    setLoading('handle');
    await patch({ is_handled: !feedback.is_handled });
  }

  const borderColor = feedback.is_starred
    ? 'border-yellow-300'
    : feedback.is_handled
    ? 'border-green-200'
    : 'border-gray-200';

  return (
    <div className={`bg-white rounded-xl border p-4 ${borderColor} transition-colors`}>
      <div className="flex items-start gap-3">
        {/* כוכבית */}
        <button
          onClick={toggleStar}
          disabled={loading === 'star'}
          className={`mt-0.5 text-lg leading-none transition-colors disabled:opacity-50 ${
            feedback.is_starred ? 'text-yellow-400' : 'text-gray-200 hover:text-yellow-300'
          }`}
          title={feedback.is_starred ? 'הסר כוכבית' : 'סמן בכוכבית'}
        >
          ★
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <p className="font-semibold text-gray-900">{feedback.subject}</p>
              <p className="text-sm text-gray-500">{feedback.full_name}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* סטטוס */}
              {feedback.is_handled ? (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ טופל</span>
              ) : (
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">חדש</span>
              )}
              <span className="text-xs text-gray-400">
                {formatDateSafe(feedback.created_at, 'dd/MM/yyyy HH:mm')}
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{feedback.content}</p>

          {feedback.handled_at && (
            <p className="text-xs text-gray-400 mb-2">
              טופל בתאריך: {formatDateSafe(feedback.handled_at, 'dd/MM/yyyy HH:mm')}
            </p>
          )}

          {/* פעולות */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={toggleHandled}
              disabled={loading === 'handle'}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                feedback.is_handled
                  ? 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
              }`}
            >
              {loading === 'handle' ? '...' : feedback.is_handled ? 'בטל טיפול' : '✓ סמן כטופל'}
            </button>

            <button
              onClick={handleDelete}
              disabled={loading === 'delete'}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 mr-auto"
            >
              {loading === 'delete' ? '...' : 'מחק'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
