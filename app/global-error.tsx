'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#fff' }}>
        <div style={{ maxWidth: 480, margin: '10vh auto', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: '#111' }}>
            שגיאת מערכת
          </h1>
          <p style={{ color: '#555', marginBottom: '1.5rem' }}>
            אירעה שגיאה בלתי צפויה. ניתן לנסות שנית או לפנות לתמיכה.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#999', marginBottom: '1rem', fontFamily: 'monospace' }}>
              קוד שגיאה: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              background: '#ea580c',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '0.6rem 1.5rem',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            נסה שנית
          </button>
        </div>
      </body>
    </html>
  );
}
