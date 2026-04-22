'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { getClientRole } from '@/lib/auth/client';
import ExportWizard from '@/components/export/ExportWizard';
import AlertsBell from '@/components/alerts/AlertsBell';

const PRIMARY_NAV = [
  { href: '/issues', label: 'דורש טיפול', prefix: '/issues' },
  { href: '/workers', label: 'עובדים', prefix: '/workers' },
  { href: '/site-managers', label: 'מנהלי עבודה', prefix: '/site-managers' },
  { href: '/vehicles', label: 'רכבים', prefix: '/vehicles' },
  { href: '/heavy-equipment', label: 'כלי צמ"ה', prefix: '/heavy-equipment' },
];

const SECONDARY_NAV = [
  { href: '/lifting-equipment', label: 'ציוד הרמה', prefix: '/lifting-equipment' },
  { href: '/subcontractors', label: 'קבלני משנה', prefix: '/subcontractors' },
];

export default function NavBar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsAdmin(getClientRole() === 'admin');
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login');
  }

  const isWorkersSection = pathname.startsWith('/workers');
  const secondaryActive = SECONDARY_NAV.some((l) => pathname.startsWith(l.prefix));

  return (
    <>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 h-16 flex items-center gap-3">

          {/* לוגו */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Image src="/logo.png" alt="לוגו חברה" width={36} height={36} className="object-contain" priority />
            <div className="leading-tight hidden lg:block">
              <p className="font-bold text-gray-900 text-sm">נתן ולדמן ובניו בע"מ</p>
              <p className="text-xs text-gray-500">ניהול בטיחות</p>
            </div>
          </Link>

          {/* ניווט ראשי — ללא overflow scroll */}
          <nav className="flex items-center gap-0.5 flex-1 min-w-0">
            {PRIMARY_NAV.map(({ href, label, prefix }) => {
              const active = pathname.startsWith(prefix);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-2.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-orange-50 text-orange-600'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </Link>
              );
            })}

            {/* dropdown "עוד" */}
            <div ref={moreRef} className="relative">
              <button
                onClick={() => setShowMore((o) => !o)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  secondaryActive
                    ? 'bg-orange-50 text-orange-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                עוד
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {showMore && (
                <div className="absolute top-full mt-1.5 right-0 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px] z-50">
                  {SECONDARY_NAV.map(({ href, label, prefix }) => {
                    const active = pathname.startsWith(prefix);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setShowMore(false)}
                        className={`block px-4 py-2 text-sm font-medium transition-colors ${
                          active ? 'bg-orange-50 text-orange-600' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          {/* פעולות */}
          <div className="flex items-center gap-1 shrink-0">
            {/* כפתורי הוספה — admin בלבד */}
            {isAdmin && isWorkersSection && pathname !== '/workers/new' && (
              <Link
                href="/workers/new"
                className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors whitespace-nowrap"
              >
                + עובד
              </Link>
            )}
            {isAdmin && pathname === '/heavy-equipment' && (
              <Link
                href="/heavy-equipment/new"
                className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors whitespace-nowrap"
              >
                + כלי
              </Link>
            )}
            {isAdmin && pathname === '/lifting-equipment' && (
              <Link
                href="/lifting-equipment/new"
                className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors whitespace-nowrap"
              >
                + ציוד
              </Link>
            )}

            {/* יצוא — admin בלבד */}
            {isAdmin && (
              <button
                onClick={() => setShowExport(true)}
                className="text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden md:inline-block whitespace-nowrap"
              >
                יצוא
              </button>
            )}

            {/* פעמון התראות — admin בלבד */}
            {isAdmin && <AlertsBell />}

            {/* משוב */}
            <Link
              href="/submit-feedback"
              className="text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden md:inline-block whitespace-nowrap"
            >
              משוב
            </Link>

            {/* פניות — admin בלבד */}
            {isAdmin && (
              <Link
                href="/feedback"
                className="text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden lg:inline-block whitespace-nowrap"
              >
                פניות
              </Link>
            )}

            {/* תג viewer */}
            {!isAdmin && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full hidden sm:inline whitespace-nowrap">
                צפייה בלבד
              </span>
            )}

            <button
              onClick={handleSignOut}
              className="text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              יציאה
            </button>
          </div>
        </div>
      </header>

      {showExport && <ExportWizard onClose={() => setShowExport(false)} />}
    </>
  );
}
