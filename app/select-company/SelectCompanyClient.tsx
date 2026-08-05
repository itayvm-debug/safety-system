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
        <div className="bg-white rounded-xl shadow p-8 max-w-md w-full text-center">
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="SafeDoc" width={48} height={48} className="object-contain mx-auto mb-3" />
          <h1 className="text-xl font-bold text-gray-900">בחר חברה</h1>
          <p className="text-sm text-gray-500 mt-1">אתה משויך למספר חברות. בחר את החברה שברצונך לנהל.</p>
        </div>

        <div className="space-y-3">
          {companies.map(company => (
            <button
              key={company.id}
              onClick={() => void selectCompany(company.id)}
              disabled={selecting !== null}
              className="w-full flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-colors text-right disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {company.logo_url ? (
                <Image
                  src={company.logo_url}
                  alt=""
                  width={40}
                  height={40}
                  unoptimized
                  className="w-10 h-10 rounded object-contain shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-orange-100 flex items-center justify-center shrink-0">
                  <span className="text-orange-600 font-bold text-sm">
                    {company.name.charAt(0)}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{company.name}</p>
                <p className="text-xs text-gray-500">{ROLE_LABELS[company.role] ?? company.role}</p>
              </div>
              {selecting === company.id && (
                <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin shrink-0" />
              )}
            </button>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
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
