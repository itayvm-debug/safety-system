'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  useSessionCompanies,
  broadcastSessionCompaniesChanged,
} from '@/lib/session/SessionCompaniesProvider';

const ROLE_LABELS: Record<string, string> = {
  owner:  'בעלים',
  admin:  'מנהל',
  member: 'משתמש',
};

function CompanyAvatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name.charAt(0);

  if (logoUrl && !imgFailed) {
    return (
      <Image
        src={logoUrl}
        alt=""
        width={48}
        height={48}
        unoptimized
        onError={() => setImgFailed(true)}
        className="w-12 h-12 rounded-xl object-contain shrink-0 border border-gray-100 bg-white p-0.5"
      />
    );
  }

  return (
    <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
      <span className="text-orange-600 font-bold text-lg leading-none">{initials}</span>
    </div>
  );
}

export default function SelectCompanyClient() {
  const { companies, activeCompanyId, platformRole, loading, error } = useSessionCompanies();
  const [selecting, setSelecting] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  const selectCompany = useCallback(async (companyId: string) => {
    setSelecting(companyId);
    try {
      const res = await fetch('/api/session/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      });
      if (!res.ok) {
        setSelectError('שגיאה בבחירת החברה. נסה שנית.');
        setSelecting(null);
        return;
      }
      broadcastSessionCompaniesChanged();
      window.location.replace('/dashboard');
    } catch {
      setSelectError('שגיאת רשת. בדוק את החיבור ונסה שנית.');
      setSelecting(null);
    }
  }, []);

  // Auto-redirect: 0 companies → login, 1 company → auto-select
  useEffect(() => {
    if (loading) return;
    if (companies.length === 0) { window.location.replace('/login'); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (companies.length === 1) { void selectCompany(companies[0].id); }
  }, [companies, loading, selectCompany]);

  if (loading || (companies.length <= 1 && !error && !selectError)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">טוען...</p>
        </div>
      </div>
    );
  }

  const displayError = selectError ?? error;

  if (displayError && companies.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <p className="text-red-600 text-sm mb-4">{displayError}</p>
          <button onClick={() => window.location.reload()} className="text-sm text-orange-600 hover:underline">
            נסה שנית
          </button>
        </div>
      </div>
    );
  }

  const selectingName = selecting ? (companies.find(c => c.id === selecting)?.name ?? '') : '';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-8" dir="rtl">

      {/* Platform brand header */}
      <div className="text-center mb-6">
        <Image
          src="/safedoc-logo.png"
          alt="SafeDoc"
          width={56}
          height={56}
          className="object-contain mx-auto mb-3"
        />
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">SafeDoc</h1>
        <p className="text-sm text-gray-500 mt-0.5">ניהול מסמכים, כשירויות ובטיחות במקום אחד</p>
      </div>

      {/* Selection card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-xl">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <p className="text-base font-semibold text-gray-800">בחר ארגון לניהול</p>
          <p className="text-xs text-gray-400 mt-0.5">אתה משויך למספר ארגונים</p>
        </div>

        <div className="p-4 space-y-2">
          {displayError && (
            <p className="text-sm text-red-600 px-1 pb-1">{displayError}</p>
          )}
          {companies.map(company => {
            const isActive    = company.id === activeCompanyId;
            const isSelecting = selecting === company.id;

            return (
              <button
                key={company.id}
                onClick={() => void selectCompany(company.id)}
                disabled={selecting !== null}
                aria-current={isActive ? 'true' : undefined}
                className={[
                  'w-full flex items-center gap-4 p-3.5 rounded-xl border text-right transition-all duration-150 group',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1',
                  selecting !== null ? 'disabled:opacity-60 disabled:cursor-not-allowed' : '',
                  isActive
                    ? 'border-orange-200 bg-orange-50 hover:border-orange-300'
                    : 'border-gray-100 hover:border-orange-300 hover:bg-orange-50',
                ].join(' ')}
              >
                <CompanyAvatar name={company.name} logoUrl={company.logo_url} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 truncate text-sm">{company.name}</p>
                    {isActive && (
                      <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                        החברה הפעילה
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full mt-0.5 inline-block">
                    {ROLE_LABELS[company.role] ?? company.role}
                  </span>
                </div>

                {isSelecting ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-orange-600 whitespace-nowrap">עובר ל־{selectingName}...</span>
                    <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <svg
                    className="w-4 h-4 text-gray-300 group-hover:text-orange-400 shrink-0 transition-colors rotate-180"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* Platform admin section — visible only to platform admins */}
        {platformRole === 'admin' && (
          <div className="px-4 pb-4">
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 mb-2 px-0.5">ניהול פלטפורמה</p>
              <Link
                href="/admin/companies"
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50 transition-all text-sm text-gray-700 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-orange-100 flex items-center justify-center shrink-0 transition-colors">
                  <svg className="w-4 h-4 text-gray-500 group-hover:text-orange-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                </div>
                <span className="font-medium">ניהול חברות</span>
                <svg className="w-4 h-4 text-gray-300 group-hover:text-orange-400 mr-auto transition-colors rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 text-center">
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.replace('/login');
            }}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            התנתק
          </button>
        </div>
      </div>
    </div>
  );
}
