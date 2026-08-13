'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { getClientRole } from '@/lib/auth/client';
import ExportWizard from '@/components/export/ExportWizard';
import AlertsBell from '@/components/alerts/AlertsBell';
import {
  useSessionCompanies,
  broadcastSessionCompaniesChanged,
} from '@/lib/session/SessionCompaniesProvider';

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
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setIsAdmin(getClientRole() === 'admin'); }, []);
  const [showExport, setShowExport] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const { companies, activeCompanyId } = useSessionCompanies();

  // סגור תפריט מובייל בכל ניווט — derived-state pattern (no effect)
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setMobileOpen(false);
    setSwitcherOpen(false);
    setMoreOpen(false);
  }

  // Close switcher on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function switchCompany(companyId: string) {
    setSwitcherOpen(false);
    setSwitching(true);
    await fetch('/api/session/company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId }),
    });
    broadcastSessionCompaniesChanged();
    window.location.replace('/dashboard');
  }

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login');
  }

  const activeCompany = companies.find(c => c.id === activeCompanyId) ?? null;
  const hasMultipleCompanies = companies.length > 1;
  const isCompanyAdmin = activeCompany?.role === 'admin' || activeCompany?.role === 'owner';

  return (
    <>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">

        {/* ═══ דסקטופ (lg+) — שורה אחת ═══════════════════════════════ */}
        <div className="hidden lg:flex max-w-[1400px] mx-auto px-4 h-16 items-center gap-2">

          {/* לוגו פלטפורמה */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Image src="/safedoc-logo.png" alt="SafeDoc" width={36} height={36} className="object-contain" priority />
            <div className="leading-tight hidden xl:block">
              <p className="font-bold text-gray-900 text-sm">SafeDoc</p>
              <p className="text-xs text-gray-500">ניהול בטיחות</p>
            </div>
          </Link>

          {/* Company display + switcher */}
          {activeCompany && (
            <>
              <div className="w-px h-6 bg-gray-200 shrink-0" aria-hidden="true" />
              <div className="relative shrink-0" ref={switcherRef}>
                <button
                  onClick={() => hasMultipleCompanies && setSwitcherOpen(o => !o)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium text-gray-700 ${hasMultipleCompanies ? 'hover:bg-gray-100 cursor-pointer' : 'cursor-default'} transition-colors`}
                  title={hasMultipleCompanies ? 'החלף חברה' : activeCompany.name}
                >
                  {activeCompany.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeCompany.logo_url}
                      alt=""
                      width={24}
                      height={24}
                      className="w-6 h-6 rounded object-contain shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded bg-orange-100 flex items-center justify-center shrink-0">
                      <span className="text-orange-600 font-bold text-xs leading-none">{activeCompany.name.charAt(0)}</span>
                    </div>
                  )}
                  <span className="max-w-[150px] truncate hidden xl:inline">{activeCompany.name}</span>
                  {hasMultipleCompanies && (
                    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 10.5L3.5 6h9L8 10.5z" />
                    </svg>
                  )}
                </button>

                {switcherOpen && (
                  <div className="absolute top-full mt-1 right-0 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    {companies.map(c => (
                      <button
                        key={c.id}
                        onClick={() => switchCompany(c.id)}
                        disabled={switching}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-right hover:bg-gray-50 transition-colors ${c.id === activeCompanyId ? 'font-semibold text-orange-600' : 'text-gray-700'}`}
                      >
                        <span className="flex-1 truncate">{c.name}</span>
                        {c.id === activeCompanyId && (
                          <svg className="w-4 h-4 text-orange-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <Link
                        href="/select-company"
                        onClick={() => setSwitcherOpen(false)}
                        className="flex items-center px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        כל החברות
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

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
            {isAdmin && (
              <button
                onClick={() => setShowExport(true)}
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap"
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
            {/* Secondary admin links — inline at 2xl+, collapsed into dropdown below 2xl */}
            {isAdmin && (
              <Link
                href="/feedback"
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden 2xl:inline-block whitespace-nowrap"
              >
                פניות
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/archive"
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden 2xl:inline-block whitespace-nowrap"
              >
                ארכיון
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin/users"
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden 2xl:inline-block whitespace-nowrap"
              >
                משתמשי הפלטפורמה
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin/companies"
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden 2xl:inline-block whitespace-nowrap"
              >
                חברות
              </Link>
            )}
            {/* More dropdown — visible at lg..xl (1024-1535px), hidden at 2xl+ where items show inline */}
            {isAdmin && (
              <div className="relative 2xl:hidden" ref={moreRef}>
                <button
                  onClick={() => setMoreOpen(o => !o)}
                  className="text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-label="עוד אפשרויות"
                  aria-expanded={moreOpen}
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <circle cx="2" cy="8" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="14" cy="8" r="1.5" />
                  </svg>
                </button>
                {moreOpen && (
                  <div className="absolute top-full mt-1 right-0 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    <Link
                      href="/feedback"
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      פניות
                    </Link>
                    <Link
                      href="/archive"
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      ארכיון
                    </Link>
                    <Link
                      href="/admin/users"
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      משתמשי הפלטפורמה
                    </Link>
                    <Link
                      href="/admin/companies"
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      חברות
                    </Link>
                  </div>
                )}
              </div>
            )}
            {(isAdmin || isCompanyAdmin) && (
              <Link
                href="/company/members"
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap"
              >
                משתמשי החברה
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
          {/* לוגו פלטפורמה (ימין ב-RTL — DOM ראשון) */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/safedoc-logo.png" alt="SafeDoc" width={32} height={32} className="object-contain" priority />
            <div>
              <p className="font-bold text-gray-900 text-sm leading-none">SafeDoc</p>
              {activeCompany && (
                <p className="text-xs text-gray-400 leading-tight truncate max-w-[120px]">{activeCompany.name}</p>
              )}
            </div>
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
              {isAdmin && (
                <Link href="/archive" className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  ארכיון
                </Link>
              )}
              {(isAdmin || isCompanyAdmin) && (
                <Link href="/company/members" className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  משתמשי החברה
                </Link>
              )}
              {isAdmin && (
                <Link href="/admin/users" className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  משתמשי הפלטפורמה
                </Link>
              )}
              {isAdmin && (
                <Link href="/admin/companies" className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  חברות
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
