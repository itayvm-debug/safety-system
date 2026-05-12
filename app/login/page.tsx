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

      if (!res.ok) {
        setError(data.error || 'שגיאה בהתחברות');
        return;
      }

      window.location.href = '/dashboard';
    } catch {
      setError('שגיאת תקשורת — נסה שנית');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-gray-50">

      {/* ═══ צד תמונה — דסקטופ בלבד ════════════════════════════════ */}
      <div className="hidden lg:block lg:w-1/2 xl:w-3/5 relative overflow-hidden">
        <Image
          src="/images/login-hero.png"
          alt="SafeDoc — ניהול מסמכי בטיחות"
          fill
          className="object-cover object-center"
          priority
          sizes="(min-width: 1024px) 50vw"
        />
        {/* gradient עדין מימין לחיבור חלק עם הטופס */}
        <div className="absolute inset-0 bg-gradient-to-l from-gray-50/60 to-transparent" />
      </div>

      {/* ═══ צד טופס ════════════════════════════════════════════════ */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex flex-col items-center justify-center px-6 py-12">

        {/* כרטיס */}
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image src="/logo.png" alt="לוגו" width={56} height={56} className="object-contain" priority />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">SafeDoc</h1>
            <p className="text-sm text-gray-500 mt-1">ניהול מסמכי בטיחות</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם משתמש או מייל</label>
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="הכנס סיסמה"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !identifier || !password}
              className="w-full bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'מתחבר...' : 'כניסה'}
            </button>
          </form>
        </div>

        {/* זכויות יוצרים */}
        <p className="mt-6 max-w-sm text-center text-xs text-gray-400 leading-relaxed px-2">
          כל הזכויות במערכת SafeDoc, לרבות המסמכים, העיצוב, הקוד, מבנה הנתונים והפונקציונליות,
          שמורות לחברת נתן ולדמן ובניו בע&quot;מ. אין להעתיק, לשכפל, להפיץ או לעשות שימוש במערכת
          או בחלק ממנה ללא אישור מראש ובכתב.
        </p>
      </div>
    </div>
  );
}
