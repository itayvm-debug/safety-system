/**
 * ⚠️ DRAFT — טיוטה לסקירת עורך דין / מומחה נגישות בלבד.
 * אין להצהיר "עומדת בתקן 5568" / "WCAG AA" עד לאחר audit מלא.
 */
import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';

export const metadata: Metadata = { title: `הצהרת נגישות — ${LEGAL.productName}` };

export default function AccessibilityPage() {
  return (
    <LegalPageLayout
      title="הצהרת נגישות"
      effectiveDate={LEGAL.termsEffectiveDate}
    >
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm mb-8">
        ⚠️ <strong>טיוטה — לסקירת מומחה נגישות ועורך דין בלבד.</strong>
        אין להצהיר עמידה בתקן עד לאחר ביצוע בדיקת נגישות מלאה.
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. מחויבותנו לנגישות</h2>
        <p className="text-gray-700 leading-relaxed">
          {LEGAL.companyName} פועלת לאפשר שימוש במערכת SafeDoc לכלל המשתמשים, לרבות אנשים עם מוגבלויות.
          אנחנו מחויבים לשיפור הנגישות בהתאם להוראות תקן ישראלי 5568 ו-WCAG 2.1.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. מצב נגישות נוכחי</h2>
        <p className="text-gray-700 leading-relaxed">
          המערכת מיישמת עקרונות נגישות בסיסיים:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed mt-2">
          <li>תמיכה מלאה ב-RTL ובעברית</li>
          <li>ניגודיות צבע מינימלית (בבדיקה)</li>
          <li>ניווט מקלדת בממשקים עיקריים</li>
          <li>שימוש ב-Semantic HTML</li>
          <li>תוויות ARIA לאלמנטים אינטראקטיביים</li>
        </ul>
        <p className="text-gray-500 text-sm mt-3">
          ⚠️ רמת עמידה: {LEGAL.accessibilityLevel} — בדיקה מלאה בתהליך.
          תאריך בדיקה אחרונה: {LEGAL.accessibilityLastAudit}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. מגבלות ידועות</h2>
        <p className="text-gray-700 leading-relaxed">
          ⚠️ TODO: לעדכן לאחר ביצוע audit נגישות מלא (שלב יב׳).
          מגבלות שנמצאו עד כה:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed mt-2">
          <li>חלק מהמודלים עשויים שלא לנהל focus באופן מיטבי בקוראי מסך</li>
          <li>טפסים מסוימים לא מסמנים שדות חובה בצורה נגישה</li>
          <li>הודעות שגיאה דינמיות אינן כוללות aria-live בכל המקרים</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. טכנולוגיות נתמכות</h2>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>דפדפנים: Chrome, Safari, Firefox, Edge (גרסאות עדכניות)</li>
          <li>קורא מסך: NVDA (Windows), VoiceOver (iOS/macOS) — בבדיקה חלקית</li>
          <li>מובייל: Safari / Chrome על iOS ו-Android</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. משוב ויצירת קשר</h2>
        <p className="text-gray-700 leading-relaxed">
          נתקלת בבעיית נגישות? נשמח לשמוע.
          אנחנו מחויבים לטפל בפניות נגישות תוך {' '}
          <strong>TODO: X ימי עסקים</strong>.
        </p>
        <p className="text-gray-700 leading-relaxed mt-2">
          <strong>אימייל:</strong>{' '}
          <a href={`mailto:${LEGAL.accessibilityContactEmail}`} className="text-orange-600 hover:underline">
            {LEGAL.accessibilityContactEmail}
          </a>
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>טלפון:</strong> {LEGAL.companyPhone}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">6. תקן ורגולציה</h2>
        <p className="text-gray-700 leading-relaxed">
          הצהרה זו מוגשת בהתאם לדרישות תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות),
          התשע&rdquo;ג-2013, ותקן ישראלי 5568 (המבוסס על WCAG 2.1).
        </p>
      </section>
    </LegalPageLayout>
  );
}
