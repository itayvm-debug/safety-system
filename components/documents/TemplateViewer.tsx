'use client';

import { useEffect, useState } from 'react';
import { templatePageUrls } from '@/lib/documents/template-page-urls';

/**
 * Shows a briefing / height-ban template INSIDE the app — never in a new tab.
 * Reported by the owner (2026-11-19): in the installed web app on iPhone a PDF opened in a new
 * tab has no way back, so the app had to be closed and reopened. Built-in templates are shown
 * as page images (all pages, any device); a company's own PDF is shown in an in-app frame.
 * "מסך מלא" opens a full-screen reader with a close button.
 */
export default function TemplateViewer({
  src,
  title = 'מסמך בטיחות',
  onContinue,
  onBack,
}: {
  src: string;
  title?: string;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [fullScreen, setFullScreen] = useState(false);
  const pages = templatePageUrls(src);

  // Lock background scroll and allow Escape while the full-screen reader is open
  useEffect(() => {
    if (!fullScreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullScreen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [fullScreen]);

  const content = pages ? (
    <div className="space-y-2 p-2">
      {pages.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- static page images, full width, lazy
        <img key={url} src={url} alt={`${title} — עמוד ${i + 1} מתוך ${pages.length}`}
          loading={i === 0 ? 'eager' : 'lazy'} className="w-full h-auto bg-white shadow-sm rounded" />
      ))}
    </div>
  ) : (
    <iframe src={src} className="w-full h-full min-h-[60vh] bg-white" title={title} />
  );

  return (
    <div>
      <div className="relative border border-gray-200 rounded-xl overflow-auto bg-gray-100" style={{ height: 'min(60vh, 520px)' }}>
        {content}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-xs text-gray-500">{pages ? `${pages.length} עמודים — גלול לקריאה` : 'גלול לקריאה'}</p>
        <button type="button" onClick={() => setFullScreen(true)} className="text-sm text-orange-600 font-medium hover:text-orange-700">
          ⤢ מסך מלא
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onContinue} className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600">
          קראתי והבנתי — המשך לחתימה ←
        </button>
        <button onClick={onBack} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">חזרה</button>
      </div>

      {fullScreen && (
        <div role="dialog" aria-modal="true" aria-label={title}
          className="fixed inset-0 z-[60] flex flex-col bg-gray-100" dir="rtl">
          <div className="flex items-center justify-between gap-2 bg-white border-b border-gray-200 px-4 py-3"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
            <button type="button" onClick={() => setFullScreen(false)} autoFocus
              className="shrink-0 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg">
              סגור ✕
            </button>
          </div>
          <div className="flex-1 overflow-auto">{content}</div>
          <div className="bg-white border-t border-gray-200 px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <button type="button" onClick={() => { setFullScreen(false); onContinue(); }}
              className="w-full py-3 bg-orange-500 text-white text-sm font-semibold rounded-lg">
              קראתי והבנתי — המשך לחתימה ←
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
