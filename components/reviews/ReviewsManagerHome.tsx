'use client';

import Link from 'next/link';
import { weekLabel } from '@/lib/reviews/week';

interface Props {
  weekStart: string;
  totalWorkers: number;
  remainingWorkers: number;
  managerWorkerId: string;
}

export default function ReviewsManagerHome({ weekStart, totalWorkers, remainingWorkers }: Props) {
  const completed = totalWorkers - remainingWorkers;
  const pct = totalWorkers > 0 ? Math.round((completed / totalWorkers) * 100) : 0;
  const allDone = remainingWorkers === 0 && totalWorkers > 0;

  return (
    <div className="max-w-md mx-auto px-4 py-8" dir="rtl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">ביצועי עובדים</h1>
      <p className="text-sm text-gray-500 mb-6">{weekLabel(weekStart)}</p>

      {totalWorkers === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
          אין עובדים להערכה השבוע.
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">התקדמות השבוע</span>
              <span className="text-sm font-bold text-orange-600">{completed}/{totalWorkers}</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {allDone
                ? 'כל הביצועים הוגשו השבוע'
                : `נותרו ${remainingWorkers} עובדים להערכה`}
            </p>
          </div>

          {allDone ? (
            <div className="flex flex-col gap-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <svg className="w-8 h-8 text-green-500 mx-auto mb-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-sm font-medium text-green-800">כל הביצועים הוגשו!</p>
              </div>
            </div>
          ) : (
            <Link
              href="/reviews/submit"
              className="block w-full text-center py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-xl shadow-sm transition-colors text-sm"
            >
              {completed > 0 ? 'המשך הגשת ביצועים' : 'התחל הגשת ביצועים'}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
