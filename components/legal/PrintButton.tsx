'use client';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-xs text-gray-400 hover:text-gray-600 shrink-0 print:hidden"
      aria-label="הדפס עמוד"
    >
      🖨 הדפסה
    </button>
  );
}
