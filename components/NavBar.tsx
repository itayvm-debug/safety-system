'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { getClientRole } from '@/lib/auth/client';
import ExportWizard from '@/components/export/ExportWizard';
import AlertsBell from '@/components/alerts/AlertsBell';

const NAV_LINKS = [
  { href: '/issues', label: 'דורש טיפול', prefix: '/issues' },
  { href: '/workers', label: 'עובדים', prefix: '/workers' },
  { href: '/site-managers', label: 'מנהלי עבודה', prefix: '/site-managers' },
  { href: '/vehicles', label: 'רכבים', prefix: '/vehicles' },
  { href: '/heavy-equipment', label: 'כלי צמ"ה', prefix: '/heavy-equipment' },
  { href: '/lifting-equipment', label: 'ציוד הרמה', prefix: '/lifting-equipment' },
  { href: '/subcontractors', label: 'קבלני משנה', prefix: '/subcontractors' },
];

export default function NavBar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setIsAdmin(getClientRole() === 'admin');
  }, []);

  // סגור תפריט מובייל בכל ניווט
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login');
  }

  const isWorkersSection = pathname.startsWith('/workers');

  return (
    <>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">

        {/* ═══ דסקטופ (lg+) — שורה אחת ═══════════════════════════════ */}
        <div className="hidden lg:flex max-w-[1400px] mx-auto px-4 h-16 items-center gap-2">

          {/* לוגו */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Image src="/logo.png" alt="לוגו חברה" width={36} height={36} className="object-contain" priority />
            <div className="leading-tight hidden xl:block">
              <p className="font-bold text-gray-900 text-sm">נתן ולדמן ובניו בע"מ</p>
              <p className="text-xs text-gray-500">ניהול בטיחות</p>
            </div>
          </Link>

          {/* ניווט — flex-1 ממלא שטח פנוי, ללא גלילה */}
          <nav className="flex items-center flex-1 min-w-0">
            {NAV_LINKS.map(({ href, label, prefix }) => {
              const active = pathname.startsWith(prefix);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-2 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-orange-50 text-orange-600'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* פעולות */}
          <div className="flex items-center gap-0.5 shrink-0">
            {isAdmin && isWorkersSection && pathname !== '/workers/new' && (
              <Link href="/workers/new" className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors whitespace-nowrap">
                + עובד
              </Link>
            )}
            {isAdmin && pathname === '/heavy-equipment' && (
              <Link href="/heavy-equipment/new" className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors whitespace-nowrap">
                + כלי
              </Link>
            )}
            {isAdmin && pathname === '/lifting-equipment' && (
              <Link href="/lifting-equipment/new" className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors whitespace-nowrap">
                + ציוד
              </Link>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowExport(true)}
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden lg:inline-block whitespace-nowrap"
              >
                יצוא
              </button>
            )}
            {isAdmin && <AlertsBell />}
            <Link
              href="/submit-feedback"
              className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              משוב
            </Link>
            {isAdmin && (
              <Link
                href="/feedback"
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden xl:inline-block whitespace-nowrap"
              >
                פניות
              </Link>
            )}
            {!isAdmin && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap">
                צפייה בלבד
              </span>
            )}
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              יציאה
            </button>
          </div>
        </div>

        {/* ═══ מובייל (<lg) — header קומפקטי ═══════════════════════════ */}
        <div className="flex lg:hidden px-4 h-14 items-center justify-between">
          {/* לוגו (ימין ב-RTL — DOM ראשון) */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/logo.png" alt="לוגו חברה" width={32} height={32} className="object-contain" priority />
            <p className="font-bold text-gray-900 text-sm">נתן ולדמן ובניו בע"מ</p>
          </Link>

          {/* כפתורים (שמאל ב-RTL — DOM אחרון) */}
          <div className="flex items-center gap-1">
            {isAdmin && <AlertsBell />}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label={mobileOpen ? 'סגור תפריט' : 'פתח תפריט'}
            >
              {mobileOpen ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ═══ תפריט מובייל נפתח ══════════════════════════════════════ */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-gray-100 bg-white pb-3">

            {/* לינקי ניווט */}
            <nav className="px-3 pt-2 space-y-0.5">
              {NAV_LINKS.map(({ href, label, prefix }) => {
                const active = pathname.startsWith(prefix);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-orange-50 text-orange-600'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>

            {/* כפתור הוספה — admin לפי עמוד */}
            {isAdmin && (isWorkersSection || pathname === '/heavy-equipment' || pathname === '/lifting-equipment') && (
              <div className="px-3 pt-2">
                {isWorkersSection && pathname !== '/workers/new' && (
                  <Link href="/workers/new" className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors">
                    + הוסף עובד
                  </Link>
                )}
                {pathname === '/heavy-equipment' && (
                  <Link href="/heavy-equipment/new" className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors">
                    + הוסף כלי צמ"ה
                  </Link>
                )}
                {pathname === '/lifting-equipment' && (
                  <Link href="/lifting-equipment/new" className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors">
                    + הוסף ציוד הרמה
                  </Link>
                )}
              </div>
            )}

            {/* פעולות משניות */}
            <div className="px-3 pt-2 mt-1 border-t border-gray-100 space-y-0.5">
              {isAdmin && (
                <button
                  onClick={() => { setMobileOpen(false); setShowExport(true); }}
                  className="w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  יצוא נתונים
                </button>
              )}
              <Link href="/submit-feedback" className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                משוב
              </Link>
              {isAdmin && (
                <Link href="/feedback" className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  פניות
                </Link>
              )}
              {!isAdmin && (
                <div className="px-3 py-2">
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">צפייה בלבד</span>
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
              >
                יציאה
              </button>
            </div>
          </div>
        )}
      </header>

      {showExport && <ExportWizard onClose={() => setShowExport(false)} />}
    </>
  );
}
