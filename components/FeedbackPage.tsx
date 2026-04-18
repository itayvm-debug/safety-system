'use client';

import { useState } from 'react';
import { SiteFeedback } from '@/types';
import { formatDateSafe } from '@/lib/utils/date';

interface Props {
  feedbackList: SiteFeedback[];
}

export default function FeedbackPage({ feedbackList: initial }: Props) {
  const [feedbackList, setFeedbackList] = useState(initial);

  function handleNew(fb: SiteFeedback) {
    setFeedbackList((prev) => [fb, ...prev]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">משוב מהשטח</h1>
        <p className="text-sm text-gray-500 mt-0.5">{feedbackList.length} פניות</p>
      </div>

      <div className="space-y-3">
        {feedbackList.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-base font-medium">אין פניות עדיין</p>
          </div>
        ) : (
          feedbackList.map((fb) => (
            <FeedbackCard key={fb.id} feedback={fb} />
          ))
        )}
      </div>
    </div>
  );
}

function FeedbackCard({ feedback }: { feedback: SiteFeedback }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-semibold text-gray-900">{feedback.subject}</p>
          <p className="text-sm text-gray-500">{feedback.full_name}</p>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {formatDateSafe(feedback.created_at, 'dd/MM/yyyy HH:mm')}
        </span>
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{feedback.content}</p>
    </div>
  );
}
