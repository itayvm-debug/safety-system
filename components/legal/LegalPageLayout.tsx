import Link from 'next/link';
import { LEGAL } from '@/lib/legal/config';
import PrintButton from './PrintButton';

interface TocItem {
  id: string;
  label: string;
}

interface NavLink {
  href: string;
  label: string;
}

interface Props {
  title: string;
  version?: string;
  effectiveDate?: string;
  /** תקציר בקצרה — מוצג בתיבה לפני התוכן */
  summary?: string;
  /** פרקי תוכן לניווט מהיר */
  toc?: TocItem[];
  prevPage?: NavLink;
  nextPage?: NavLink;
  children: React.ReactNode;
}

export default function LegalPageLayout({
  title,
  version,
  effectiveDate,
  summary,
  toc,
  prevPage,
  nextPage,
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* ─── Sticky header ─── */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10 print:static">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            חזרה
          </Link>
          <span className="text-sm font-semibold text-orange-600 truncate">{LEGAL.productName}</span>
          <PrintButton />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">

        {/* ─── Draft notice ─── */}
        {!LEGAL.legallyReviewed && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-amber-800 text-sm mb-6 print:hidden">
            <strong>טיוטה בלבד — לסקירת עורך דין ישראלי.</strong>{' '}
            מסמך זה טרם עבר סקירה משפטית ואינו מחייב עד לאישור סופי.
          </div>
        )}

        {/* ─── Title ─── */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
        {(version || effectiveDate) && (
          <p className="text-sm text-gray-400 mb-6">
            {version && `גרסה ${version}`}
            {version && effectiveDate && ' · '}
            {effectiveDate && `בתוקף מ-${effectiveDate}`}
          </p>
        )}

        {/* ─── Summary box ─── */}
        {summary && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900 mb-6">
            <p className="font-semibold mb-1">בקצרה</p>
            <p className="leading-relaxed">{summary}</p>
          </div>
        )}

        {/* ─── Table of Contents ─── */}
        {toc && toc.length > 0 && (
          <details className="mb-8 border border-gray-200 rounded-lg overflow-hidden" open>
            <summary className="px-4 py-3 bg-gray-50 cursor-pointer text-sm font-semibold text-gray-700 select-none list-none flex items-center justify-between">
              תוכן עניינים
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <ol className="px-4 py-3 space-y-1.5 text-sm text-gray-700 bg-white">
              {toc.map((item, i) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="hover:text-orange-600 hover:underline">
                    {i + 1}. {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        )}

        {/* ─── Page content ─── */}
        <div className="prose prose-sm prose-gray max-w-none space-y-8">
          {children}
        </div>

        {/* ─── Help box ─── */}
        <div className="mt-12 bg-gray-50 border border-gray-200 rounded-lg px-5 py-4 text-sm text-gray-700">
          <p className="font-semibold mb-2">שאלות? צור קשר</p>
          <p>
            <span className="text-gray-500">אימייל: </span>
            <a href={`mailto:${LEGAL.privacyContactEmail}`} className="text-orange-600 hover:underline">
              {LEGAL.privacyContactEmail}
            </a>
          </p>
          <p>
            <span className="text-gray-500">טלפון: </span>
            <a href={`tel:${LEGAL.companyPhone}`} className="text-orange-600 hover:underline">
              {LEGAL.companyPhone}
            </a>
          </p>
        </div>

        {/* ─── Prev / Next navigation ─── */}
        {(prevPage || nextPage) && (
          <nav className="mt-8 flex justify-between gap-4 text-sm print:hidden" aria-label="ניווט בין מסמכים">
            {prevPage ? (
              <Link href={prevPage.href} className="flex items-center gap-1.5 text-orange-600 hover:underline">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {prevPage.label}
              </Link>
            ) : <span />}
            {nextPage ? (
              <Link href={nextPage.href} className="flex items-center gap-1.5 text-orange-600 hover:underline">
                {nextPage.label}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ) : <span />}
          </nav>
        )}

        {/* ─── Footer links ─── */}
        <footer className="mt-16 pt-8 border-t border-gray-200 text-xs text-gray-400 space-y-1 print:mt-8">
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            <Link href="/terms" className="hover:text-gray-600">תנאי שימוש</Link>
            <span>·</span>
            <Link href="/privacy" className="hover:text-gray-600">מדיניות פרטיות</Link>
            <span>·</span>
            <Link href="/accessibility" className="hover:text-gray-600">נגישות</Link>
            <span>·</span>
            <Link href="/subprocessors" className="hover:text-gray-600">ספקי משנה</Link>
            <span>·</span>
            <Link href="/data-retention" className="hover:text-gray-600">שמירת מידע</Link>
            <span>·</span>
            <Link href="/about" className="hover:text-gray-600">אודות</Link>
          </p>
          <p>© {new Date().getFullYear()} {LEGAL.companyName}</p>
        </footer>
      </main>
    </div>
  );
}
