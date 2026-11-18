'use client';

import { useState } from 'react';
import Image from 'next/image';
import { clearAllSnapshots } from '@/lib/offline/cache';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Second step: shown when the account has two-factor sign-in
  const [mfaStep, setMfaStep] = useState(false);
  const [code, setCode] = useState('');

  function finishLogin(data: { mfaSetupRequired?: boolean }) {
    clearAllSnapshots(); // never show a previous user's cached lists
    window.location.href = data.mfaSetupRequired ? '/account/security' : '/dashboard';
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'שגיאה בהתחברות'); return; }
      if (data.mfaRequired) { setPassword(''); setMfaStep(true); return; }
      finishLogin(data);
    } catch {
      setError('שגיאת תקשורת — נסה שנית');
    } finally {
      setLoading(false);
    }
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'קוד שגוי');
        setCode('');
        if (res.status === 401 && /פג תוקף/.test(data.error ?? '')) setMfaStep(false);
        return;
      }
      finishLogin(data);
    } catch {
      setError('שגיאת תקשורת — נסה שנית');
    } finally {
      setLoading(false);
    }
  }

  return (
    /*
     * מבנה:
     * 1. relative min-h-screen — container ראשי
     * 2. absolute inset-0 hidden lg:block — שכבת רקע (דסקטופ בלבד)
     *    משתמש ב-background-image CSS ולא ב-Next.js Image/fill
     *    כדי לוודא כיסוי מלא ללא תלות ב-dimensions של parent
     * 3. absolute inset-0 lg:hidden — רקע אפור למובייל
     * 4. relative z-10 min-h-screen flex items-center — תוכן מרכזי
     */
    <div className="relative min-h-screen">

      {/* ── רקע דסקטופ: תמונה מלאה על כל המסך ─────────────────
          background-image CSS מובטח לכסות 100% width + height.
          hidden lg:block — מוסתר לחלוטין במובייל.
      ──────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 hidden lg:block bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/branding/safedoc-entrance-screen.png')" }}
        aria-hidden="true"
      >
        {/* Overlay כהה לקריאות */}
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* ── רקע מובייל: אפור בהיר פשוט ─────────────────────────
          lg:hidden — מוסתר בדסקטופ.
      ──────────────────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-gray-50 lg:hidden" aria-hidden="true" />

      {/* ── שכבת תוכן: מרכז אנכי ואופקי על כל המסך ─────────────
          relative z-10 — מעל שכבות הרקע.
          min-h-screen flex items-center justify-center — מרכז אמיתי.
          אין columns / אין grid / אין flex-row.
      ──────────────────────────────────────────────────────── */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8">

        {/* כרטיס התחברות */}
        <div className="login-card-anim w-full max-w-[460px] bg-white rounded-3xl shadow-2xl p-8 sm:p-10">

          {/* לוגו + כותרת */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image
                src="/branding/safedoc-app-icon.png"
                alt="SafeDoc"
                width={60}
                height={60}
                className="object-contain"
                priority
              />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">SafeDoc</h1>
            <p className="text-sm text-gray-500 mt-1">ניהול מסמכי בטיחות</p>
          </div>

          {mfaStep ? (
            <form onSubmit={handleCode} className="space-y-4">
              <div>
                <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700 mb-1.5">
                  קוד מאפליקציית האימות
                </label>
                <p id="mfa-code-help" className="text-xs text-gray-500 mb-2">
                  פתח את אפליקציית האימות בטלפון והקלד את 6 הספרות שמופיעות תחת SafeDoc.
                </p>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  aria-describedby="mfa-code-help"
                  dir="ltr"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-2xl tracking-[0.5em] text-center
                             focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
              </div>

              {error && (
                <div role="alert" aria-live="assertive" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full bg-orange-500 text-white py-3.5 rounded-xl font-semibold text-base
                           hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors shadow-sm"
              >
                {loading ? 'מאמת...' : 'אישור'}
              </button>
              <button
                type="button"
                onClick={() => { setMfaStep(false); setCode(''); setError(''); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                חזרה למסך הכניסה
              </button>
            </form>
          ) : (
          /* טופס */
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                שם משתמש או מייל
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="נא הקלד שם משתמש או מייל"
                required
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                dir="ltr"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base
                           focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent
                           transition-shadow placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="הכנס סיסמה"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base
                           focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent
                           transition-shadow placeholder:text-gray-400"
              />
            </div>

            {error && (
              <div role="alert" aria-live="assertive" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !identifier || !password}
              className="w-full bg-orange-500 text-white py-3.5 rounded-xl font-semibold text-base
                         hover:bg-orange-600 active:bg-orange-700
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors shadow-sm"
            >
              {loading ? 'מתחבר...' : 'כניסה למערכת'}
            </button>
          </form>
          )}
        </div>

        {/* זכויות יוצרים — גלוי בכל מסך, צבע מותאם לרקע */}
        <p className="mt-6 max-w-md text-center text-xs leading-relaxed px-4
                      text-gray-400 lg:text-white/55">
          כל הזכויות במערכת SafeDoc שמורות לבעלי המערכת. אין להעתיק, לשכפל, להפיץ או לעשות שימוש במערכת או בחלק ממנה ללא אישור מראש ובכתב.
        </p>
      </div>
    </div>
  );
}
