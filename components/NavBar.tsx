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

  useEffect(() => {
    setIsAdmin(getClientRole() === 'admin');
  }, []);

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login');
  }

  const isWorkersSection = pathname.startsWith('/workers');

  return (
    <>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        {/*
          קונטיינר רחב (1400px) כדי לאפשר לכל הפריטים להיכנס בשורה אחת.
          flex items-center gap-2 — שלושה בלוקים: לוגו | nav | פעולות.
          הסרנו overflow-x-auto מה-nav — אין גלילה אופקית.
        */}
        <div className="max-w-[1400px] mx-auto px-4 h-16 flex items-center gap-2">

          {/* לוגו */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Image src="/logo.png" alt="לוגו חברה" width={36} height={36} className="object-contain" priority />
            <div className="leading-tight hidden xl:block">
              <p className="font-bold text-gray-900 text-sm">נתן ולדמן ובניו בע"מ</p>
              <p className="text-xs text-gray-500">ניהול בטיחות</p>
            </div>
          </Link>

          {/* ניווט — flex-1 ממלא את השטח הפנוי, ללא גלילה */}
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
            {/* כפתורי הוספה — admin בלבד, לפי עמוד */}
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

            {/* יצוא — admin, מוסתר מתחת ל-lg */}
            {isAdmin && (
              <button
                onClick={() => setShowExport(true)}
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden lg:inline-block whitespace-nowrap"
              >
                יצוא
              </button>
            )}

            {/* פעמון התראות — admin בלבד */}
            {isAdmin && <AlertsBell />}

            {/* משוב */}
            <Link
              href="/submit-feedback"
              className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden md:inline-block whitespace-nowrap"
            >
              משוב
            </Link>

            {/* פניות — admin, מוסתר מתחת ל-xl */}
            {isAdmin && (
              <Link
                href="/feedback"
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden xl:inline-block whitespace-nowrap"
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
              className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap"
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
