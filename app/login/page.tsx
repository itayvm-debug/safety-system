'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      window.location.href = '/dashboard';
    } catch {
      setError('שגיאת תקשורת — נסה שנית');
    } finally {
      setLoading(false);
    }
  }

  return (
    /*
     * wrapper: min-h-screen + relative — עמוד מינימום גובה המסך.
     * bg-gray-50 מוצג במובייל. בדסקטופ מכוסה על-ידי תמונת הרקע.
     */
    <div className="relative min-h-screen bg-gray-50">

      {/* ── תמונת רקע מלאה — דסקטופ בלבד ─────────────────────────
          absolute inset-0 ממלא את ה-wrapper ללא fixed positioning.
          hidden lg:block — לא נטען כלל ב-DOM במובייל (נגישות + ביצועים).
      ──────────────────────────────────────────────────────────── */}
      <div className="absolute inset-0 hidden lg:block overflow-hidden" aria-hidden="true">
        <Image
          src="/images/login-hero.png"
          alt=""
          fill
          className="object-cover object-center"
          priority
          sizes="100vw"
          quality={85}
        />
        {/* overlay: gradient כהה מלמטה + שכבת אחידה לקריאות */}
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
      </div>

      {/* ── שכבת תוכן — מרכז אנכי ואופקי ─────────────────────────
          relative z-10 מגביה מעל שכבת התמונה.
          min-h-screen + flex items-center — מרכז אנכי אמיתי.
      ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-10">

        {/* כרטיס התחברות */}
        <div className="login-card-anim w-full max-w-[460px] bg-white rounded-3xl shadow-2xl p-8 sm:p-10">

          {/* לוגו + כותרת */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image
                src="/logo.png"
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

          {/* טופס */}
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
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
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
        </div>

        {/* טקסט זכויות יוצרים — גלוי בכל מסך, מותאם צבע לרקע */}
        <p className="mt-6 max-w-md text-center text-xs leading-relaxed px-4
                      text-gray-400 lg:text-white/50">
          כל הזכויות במערכת SafeDoc, לרבות המסמכים, העיצוב, הקוד, הנתונים והפונקציונליות
          שמורות לחברת נתן ולדמן ובניו בע&quot;מ. אין להעתיק, לשכפל, להפיץ או לעשות שימוש
          במערכת או בחלק ממנה ללא אישור מראש ובכתב.
        </p>
      </div>
    </div>
  );
}
