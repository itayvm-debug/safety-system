'use client';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-xs text-gray-600 hover:text-gray-900 shrink-0 print:hidden"
      aria-label="הדפס עמוד"
    >
      🖨 הדפסה
    </button>
  );
}
