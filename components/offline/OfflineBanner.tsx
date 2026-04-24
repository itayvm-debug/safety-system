'use client';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      className="fixed bottom-0 inset-x-0 z-50 bg-yellow-50 border-t-2 border-yellow-300 px-4 py-2.5 flex items-center justify-center gap-2 text-sm shadow-md"
    >
      {/* Wi-Fi off icon */}
      <svg className="w-4 h-4 text-yellow-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0118 12.5" />
        <path d="M5 12.55a11 11 0 015.13-8.4" />
        <path d="M10.71 5.05A16 16 0 0122.56 9" />
        <path d="M1.42 9a16 16 0 014.7-2.88" />
        <path d="M8.53 16.11a6 6 0 016.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <span className="font-semibold text-yellow-800">מצב לא מקוון</span>
      <span className="text-yellow-700">— הנתונים עשויים להיות לא מעודכנים. עריכה אינה זמינה.</span>
    </div>
  );
}
