'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

interface CompanyOption {
  id: string;
  name: string;
  logo_url: string | null;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'בעלים',
  admin: 'מנהל',
  member: 'חבר',
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
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // selectCompany must be declared (via useCallback) BEFORE the useEffect that references it
  const selectCompany = useCallback(async (companyId: string) => {
    setSelecting(companyId);
    try {
      const res = await fetch('/api/session/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      });
      if (!res.ok) {
        setError('שגיאה בבחירת החברה. נסה שנית.');
        setSelecting(null);
        return;
      }
      window.location.replace('/dashboard');
    } catch {
      setError('שגיאת רשת. בדוק את החיבור ונסה שנית.');
      setSelecting(null);
    }
  }, []); // React state setters are stable — no external deps

  useEffect(() => {
    fetch('/api/session/companies')
      .then(r => r.json())
      .then((data: { companies?: CompanyOption[] }) => {
        const list: CompanyOption[] = data.companies ?? [];
        setCompanies(list);

        if (list.length === 0) {
          window.location.replace('/login');
          return;
        }
        if (list.length === 1) {
          void selectCompany(list[0].id);
          return;
        }
        setLoading(false);
      })
      .catch(() => {
        setError('שגיאה בטעינת רשימת החברות. נסה לרענן את הדף.');
        setLoading(false);
      });
  }, [selectCompany]); // stable reference via useCallback

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">טוען...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-orange-600 hover:underline"
          >
            נסה שנית
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-8" dir="rtl">
      {/* Platform brand header */}
      <div className="text-center mb-6">
        <Image
          src="/safedoc-logo.png"
          alt="SafeDoc"
          width={52}
          height={52}
          className="object-contain mx-auto mb-3"
        />
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">SafeDoc</h1>
        <p className="text-sm text-gray-500">ניהול מסמכי בטיחות</p>
      </div>

      {/* Selection card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <p className="text-base font-semibold text-gray-800">בחר ארגון לניהול</p>
          <p className="text-xs text-gray-400 mt-0.5">אתה משויך למספר ארגונים</p>
        </div>

        <div className="p-4 space-y-2">
          {companies.map(company => (
            <button
              key={company.id}
              onClick={() => void selectCompany(company.id)}
              disabled={selecting !== null}
              className="w-full flex items-center gap-4 p-3.5 rounded-xl border border-gray-100 hover:border-orange-300 hover:bg-orange-50 text-right disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 group"
            >
              <CompanyAvatar name={company.name} logoUrl={company.logo_url} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate text-sm">{company.name}</p>
                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full mt-0.5 inline-block">
                  {ROLE_LABELS[company.role] ?? company.role}
                </span>
              </div>
              {selecting === company.id ? (
                <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin shrink-0" />
              ) : (
                <svg className="w-4 h-4 text-gray-300 group-hover:text-orange-400 shrink-0 transition-colors rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          ))}
        </div>

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
