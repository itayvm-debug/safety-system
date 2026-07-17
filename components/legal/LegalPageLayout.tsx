import Link from 'next/link';
import { LEGAL } from '@/lib/legal/config';

interface Props {
  title: string;
  version?: string;
  effectiveDate?: string;
  children: React.ReactNode;
}

export default function LegalPageLayout({ title, version, effectiveDate, children }: Props) {
  return (
    <div className="min-h-screen bg-white" dir="rtl">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            חזרה למערכת
          </Link>
          <span className="text-sm font-semibold text-orange-600">{LEGAL.productName}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>

        {(version || effectiveDate) && (
          <p className="text-sm text-gray-400 mb-8">
            {version && `גרסה ${version}`}
            {version && effectiveDate && ' · '}
            {effectiveDate && `בתוקף מ-${effectiveDate}`}
          </p>
        )}

        <div className="prose prose-sm prose-gray max-w-none space-y-6">
          {children}
        </div>

        <footer className="mt-16 pt-8 border-t border-gray-200 text-xs text-gray-400 space-y-1">
          <p>
            <Link href="/terms" className="hover:text-gray-600">תנאי שימוש</Link>
            {' · '}
            <Link href="/privacy" className="hover:text-gray-600">מדיניות פרטיות</Link>
            {' · '}
            <Link href="/accessibility" className="hover:text-gray-600">הצהרת נגישות</Link>
            {' · '}
            <Link href="/subprocessors" className="hover:text-gray-600">ספקי משנה</Link>
            {' · '}
            <Link href="/data-retention" className="hover:text-gray-600">מדיניות שמירת מידע</Link>
          </p>
          <p>© {new Date().getFullYear()} {LEGAL.companyName}</p>
        </footer>
      </main>
    </div>
  );
}
