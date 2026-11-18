'use client';

import { useCallback, useEffect, useState } from 'react';

interface Status {
  enabled: boolean;
  pending: boolean;
  required: boolean;
  enforced: boolean;
  daysLeft: number;
}

interface Enrolment {
  qrSvg: string;
  secret: string;
}

export default function AccountSecurityClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/account/mfa', { cache: 'no-store' });
    if (res.ok) setStatus(await res.json());
    else setError('לא ניתן לטעון את מצב האבטחה');
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function start() {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/account/mfa', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'שגיאה'); return; }
      setEnrolment({ qrSvg: data.qrSvg, secret: data.secret });
    } catch { setError('שגיאת תקשורת'); } finally { setBusy(false); }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/account/mfa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'קוד שגוי'); setCode(''); return; }
      setDone(true); setEnrolment(null); setCode('');
      await load();
    } catch { setError('שגיאת תקשורת'); } finally { setBusy(false); }
  }

  if (!status) {
    return <p className="text-sm text-gray-500" role="status">{error || 'טוען…'}</p>;
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5" aria-labelledby="mfa-title">
      <div>
        <h1 id="mfa-title" className="text-xl font-bold text-gray-900">אימות דו-שלבי</h1>
        <p className="text-sm text-gray-500 mt-1">
          בנוסף לסיסמה, הכניסה תדרוש קוד בן 6 ספרות מאפליקציית אימות בטלפון
          (Google Authenticator, Microsoft Authenticator או דומה).
        </p>
      </div>

      {status.enabled ? (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm" role="status">
          {done ? 'אימות דו-שלבי הופעל בהצלחה.' : 'אימות דו-שלבי פעיל בחשבון.'}
          <span className="block text-xs text-green-700 mt-1">
            אם הטלפון אבד — פנה למנהל מערכת אחר לאיפוס, ואז הפעל מחדש.
          </span>
        </div>
      ) : (
        <>
          {status.required && (
            <div className={`rounded-xl px-4 py-3 text-sm border ${status.enforced ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`} role="alert">
              {status.enforced
                ? 'למנהלי מערכת אימות דו-שלבי הוא חובה. יש להפעיל אותו כדי להמשיך לעבוד במערכת.'
                : `למנהלי מערכת אימות דו-שלבי הוא חובה. נותרו ${status.daysLeft} ימים להפעלה.`}
            </div>
          )}

          {!enrolment ? (
            <button
              type="button"
              onClick={start}
              disabled={busy}
              className="bg-orange-500 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50"
            >
              {busy ? 'מכין…' : 'הפעלת אימות דו-שלבי'}
            </button>
          ) : (
            <form onSubmit={confirm} className="space-y-4">
              <ol className="list-decimal pr-5 text-sm text-gray-700 space-y-1">
                <li>פתח את אפליקציית האימות ובחר “הוספת חשבון”.</li>
                <li>סרוק את הקוד, או הקלד ידנית את המפתח שמתחתיו.</li>
                <li>הקלד כאן את 6 הספרות שהאפליקציה מציגה.</li>
              </ol>
              <div
                className="mx-auto w-[220px] h-[220px] bg-white"
                role="img"
                aria-label="קוד QR להוספת SafeDoc לאפליקציית האימות"
                // SVG produced on our server by the qrcode library from our own otpauth URI
                dangerouslySetInnerHTML={{ __html: enrolment.qrSvg }}
              />
              <p className="text-xs text-gray-500 text-center">
                מפתח להקלדה ידנית:
                <code dir="ltr" className="block mt-1 font-mono text-sm text-gray-800 break-all select-all">{enrolment.secret}</code>
              </p>
              <div>
                <label htmlFor="mfa-enrol-code" className="block text-sm font-medium text-gray-700 mb-1.5">קוד מהאפליקציה</label>
                <input
                  id="mfa-enrol-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoComplete="one-time-code"
                  required
                  dir="ltr"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-2xl tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full bg-orange-500 text-white py-3 rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50"
              >
                {busy ? 'מאמת…' : 'אישור והפעלה'}
              </button>
            </form>
          )}
        </>
      )}

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}
    </section>
  );
}
