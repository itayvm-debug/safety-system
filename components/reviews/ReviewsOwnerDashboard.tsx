'use client';

import Link from 'next/link';
import { weekLabel } from '@/lib/reviews/week';

type Assignment = { id: string; worker_id: string; evaluator_manager_id: string | null };
type Review = {
  id: string; worker_id: string; evaluator_manager_id: string | null;
  submitted_at: string | null; is_not_evaluable: boolean;
  productivity_rating: number | null; quality_rating: number | null;
  reliability_rating: number | null; discipline_rating: number | null;
  teamwork_rating: number | null; safety_rating: number | null;
};
type Manager = { id: string; full_name: string };

interface Props {
  companyId: string;
  weekStart: string;
  assignments: Assignment[];
  reviews: Review[];
  managers: Manager[];
  companyRole: string;
}

const RATING_FIELDS = [
  'productivity_rating', 'quality_rating', 'reliability_rating',
  'discipline_rating', 'teamwork_rating', 'safety_rating',
] as const;

function avgRating(review: Review): number | null {
  const vals = RATING_FIELDS.map(f => review[f]).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export default function ReviewsOwnerDashboard({ weekStart, assignments, reviews, managers, companyRole }: Props) {
  const submittedReviews = reviews.filter(r => r.submitted_at);
  const totalAssigned = assignments.length;
  const completionPct = totalAssigned > 0 ? Math.round((submittedReviews.length / totalAssigned) * 100) : 0;

  // Per-manager completion
  const managerStats = managers.map(m => {
    const assigned = assignments.filter(a => a.evaluator_manager_id === m.id);
    const submitted = submittedReviews.filter(r => r.evaluator_manager_id === m.id);
    return { manager: m, assigned: assigned.length, submitted: submitted.length };
  }).filter(s => s.assigned > 0).sort((a, b) => b.assigned - a.assigned);

  // Company-wide average per dimension
  const ratingAverages = RATING_FIELDS.map(field => {
    const vals = submittedReviews
      .filter(r => !r.is_not_evaluable)
      .map(r => r[field])
      .filter((v): v is number => v !== null);
    return {
      field,
      label: { productivity_rating: 'פרודוקטיביות', quality_rating: 'איכות', reliability_rating: 'אמינות', discipline_rating: 'משמעת', teamwork_rating: 'צוות', safety_rating: 'בטיחות' }[field],
      avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
    };
  });

  const overallAvg =
    submittedReviews.filter(r => !r.is_not_evaluable).length > 0
      ? submittedReviews
          .filter(r => !r.is_not_evaluable)
          .map(r => avgRating(r))
          .filter((v): v is number => v !== null)
          .reduce((a, b, _, arr) => a + b / arr.length, 0)
      : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ביצועי עובדים</h1>
          <p className="text-sm text-gray-500">{weekLabel(weekStart)}</p>
        </div>
        <div className="flex gap-2">
          {(companyRole === 'admin' || companyRole === 'owner') && (
            <>
              <Link
                href="/reviews/manager-setup"
                className="px-3 py-2 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                שיוך מנהלים
              </Link>
              <Link
                href="/reviews/reports"
                className="px-3 py-2 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
              >
                דוחות
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-900">{totalAssigned}</p>
          <p className="text-xs text-gray-500 mt-1">הוקצו להערכה</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-green-600">{submittedReviews.length}</p>
          <p className="text-xs text-gray-500 mt-1">הוגשו</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-center">
          <p className={`text-2xl font-bold ${completionPct === 100 ? 'text-green-600' : 'text-orange-600'}`}>
            {completionPct}%
          </p>
          <p className="text-xs text-gray-500 mt-1">השלמה</p>
        </div>
      </div>

      {/* Overall average */}
      {overallAvg !== null && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">ממוצע כללי השבוע</span>
            <span className="text-xl font-bold text-orange-600">{overallAvg.toFixed(1)}/5</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ratingAverages.map(({ field, label, avg }) => (
              <div key={field} className="text-center">
                <p className="text-sm font-semibold text-gray-800">{avg !== null ? avg.toFixed(1) : '—'}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-manager completion */}
      {managerStats.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">סטטוס לפי מנהל אתר</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {managerStats.map(({ manager, assigned, submitted }) => {
              const pct = assigned > 0 ? Math.round((submitted / assigned) * 100) : 0;
              return (
                <div key={manager.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{manager.full_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 shrink-0">{submitted}/{assigned}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${pct === 100 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {assignments.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">
          אין הקצאות להערכה לשבוע זה.{' '}
          <button
            onClick={() => fetch('/api/reviews/snapshot', { method: 'POST' }).then(() => window.location.reload())}
            className="text-orange-600 hover:underline"
          >
            צור הקצאות
          </button>
        </div>
      )}
    </div>
  );
}
