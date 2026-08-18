'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { LEGAL } from '@/lib/legal/config';

export default function LegalConsentPage() {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms || !acceptedPrivacy) return;
    if (submitting.current) return;
    submitting.current = true;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/legal-consent', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted_terms: true, accepted_privacy: true }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { error?: string }).error ?? 'שגיאה בשמירת ההסכמה';
        setError(`(${res.status}) ${msg}`);
        return;
      }

      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('שגיאת תקשורת — נסה שנית');
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-8" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image src="/branding/safedoc-app-icon.png" alt="SafeDoc" width={48} height={48} className="object-contain" priority />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{LEGAL.productName}</h1>
          <p className="text-sm text-gray-500 mt-1">לפני שתמשיך, יש לאשר את התנאים הבאים</p>
        </div>

        {LEGAL.legallyReviewed === false && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-700 text-xs mb-6">
            ⚠️ מסמכים אלה הם טיוטות לסקירת עורך דין. טרם אושרו סופית.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* שורה 1 — תנאי שימוש */}
          <div className="flex gap-3 items-start">
            <input
              id="accept-terms"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-orange-500 shrink-0 cursor-pointer"
              aria-required="true"
            />
            <div className="text-sm text-gray-700">
              <label htmlFor="accept-terms" className="cursor-pointer leading-relaxed block select-none">
                קראתי ואני מסכים/ה לתנאי השימוש של מערכת SafeDoc
                {' '}(גרסה {LEGAL.termsVersion})
              </label>
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-600 hover:underline text-xs mt-0.5 inline-block"
              >
                קרא/י את תנאי השימוש ↗
              </Link>
            </div>
          </div>

          {/* שורה 2 — מדיניות פרטיות */}
          <div className="flex gap-3 items-start">
            <input
              id="accept-privacy"
              type="checkbox"
              checked={acceptedPrivacy}
              onChange={(e) => setAcceptedPrivacy(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-orange-500 shrink-0 cursor-pointer"
              aria-required="true"
            />
            <div className="text-sm text-gray-700">
              <label htmlFor="accept-privacy" className="cursor-pointer leading-relaxed block select-none">
                קראתי ואני מסכים/ה למדיניות הפרטיות ומאשר/ת את עיבוד המידע האישי כמתואר בה
              </label>
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-600 hover:underline text-xs mt-0.5 inline-block"
              >
                קרא/י את מדיניות הפרטיות ↗
              </Link>
            </div>
          </div>

          {error && (
            <div role="alert" aria-live="assertive" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!acceptedTerms || !acceptedPrivacy || loading}
            className="w-full bg-orange-500 text-white py-3 rounded-xl font-semibold text-base
                       hover:bg-orange-600 active:bg-orange-700
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors mt-2"
          >
            {loading ? 'שומר...' : 'אישור והמשך'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6 leading-relaxed">
          אישור זה נדרש פעם אחת בלבד לכל גרסת תנאים.
          הסכמתך נשמרת ב-log מאובטח.
        </p>
      </div>
    </div>
  );
}
