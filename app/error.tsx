'use client';

/**
 * Error page inside the app layout (the nav stays). Shown when a server page throws — for
 * example when the database did not answer (getPageCompanyContext). Before 2026-11-20 such a
 * failure redirected to /login, which looked like being logged out.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div dir="rtl" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-xl font-bold text-gray-900">משהו השתבש בטעינת הדף</h1>
      <p className="mb-6 text-gray-600">
        ייתכן שזו תקלה זמנית בחיבור לשרת. הנתונים שלך לא נמחקו — נסה שוב בעוד רגע.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-orange-600 px-6 py-3 font-semibold text-white hover:bg-orange-700"
      >
        נסה שוב
      </button>
      {error.digest && (
        <p className="mt-6 font-mono text-xs text-gray-400">קוד שגיאה: {error.digest}</p>
      )}
    </div>
  );
}
