'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { getClientRole } from '@/lib/auth/client';
import ExportWizard from '@/components/export/ExportWizard';

const NAV_LINKS = [
  { href: '/workers', label: 'עובדים', prefix: '/workers' },
  { href: '/site-managers', label: 'מנהלי עבודה', prefix: '/site-managers' },
  { href: '/heavy-equipment', label: 'כלי צמ"ה', prefix: '/heavy-equipment' },
  { href: '/lifting-equipment', label: 'ציוד הרמה', prefix: '/lifting-equipment' },
  { href: '/subcontractors', label: 'קבלני משנה', prefix: '/subcontractors' },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
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
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* לוגו */}
        <Link href="/dashboard" className="flex items-center gap-3 shrink-0">
          <Image src="/logo.png" alt="לוגו חברה" width={40} height={40} className="object-contain" priority />
          <div className="leading-tight hidden sm:block">
            <p className="font-bold text-gray-900 text-sm">נתן ולדמן ובניו בע"מ</p>
            <p className="text-xs text-gray-500">ניהול בטיחות</p>
          </div>
        </Link>

        {/* ניווט */}
        <nav className="flex items-center gap-0.5 overflow-x-auto">
          {NAV_LINKS.map(({ href, label, prefix }) => {
            const active = pathname.startsWith(prefix);
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
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
        <div className="flex items-center gap-2 shrink-0">
          {/* כפתורי הוספה — admin בלבד */}
          {isAdmin && isWorkersSection && pathname !== '/workers/new' && (
            <Link href="/workers/new" className="bg-orange-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors">
              + עובד
            </Link>
          )}
          {isAdmin && pathname === '/heavy-equipment' && (
            <Link href="/heavy-equipment/new" className="bg-orange-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors">
              + כלי
            </Link>
          )}
          {isAdmin && pathname === '/lifting-equipment' && (
            <Link href="/lifting-equipment/new" className="bg-orange-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors">
              + ציוד
            </Link>
          )}

          {/* יצוא נתונים — admin בלבד */}
          {isAdmin && (
            <button
              onClick={() => setShowExport(true)}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors hidden sm:inline-block"
            >
              יצוא
            </button>
          )}

          {/* משוב */}
          <Link
            href="/submit-feedback"
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            משוב
          </Link>

          {/* פניות — admin בלבד */}
          {isAdmin && (
            <Link
              href="/feedback"
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors hidden sm:inline-block"
            >
              פניות
            </Link>
          )}

          {/* תג viewer */}
          {!isAdmin && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full hidden sm:inline">
              צפייה בלבד
            </span>
          )}

          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
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
