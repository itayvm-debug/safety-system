import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';

export const metadata: Metadata = { title: `הצהרת נגישות — ${LEGAL.productName}` };

export default function AccessibilityPage() {
  return (
    <LegalPageLayout
      title="הצהרת נגישות"
      version={LEGAL.accessibilityVersion}
      effectiveDate={LEGAL.termsEffectiveDate}
      summary={`${LEGAL.companyName} פועלת לשיפור הנגישות של מערכת SafeDoc. מסמך זה מפרט את מצב הנגישות הנוכחי, מגבלות ידועות, וערוצי דיווח. הצהרה זו היא ביניים — בדיקה מקצועית מלאה טרם בוצעה.`}
      prevPage={{ href: '/data-retention', label: 'שמירת מידע' }}
      nextPage={{ href: '/about', label: 'אודות' }}
    >

      <section id="commitment">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. מחויבותנו לנגישות</h2>
        <p className="text-gray-700 leading-relaxed">
          {LEGAL.companyName} מחויבת לנגישות דיגיטלית ולאפשר שימוש במערכת SafeDoc לכלל המשתמשים,
          לרבות אנשים עם מוגבלויות. אנחנו פועלים לפי עקרונות WCAG 2.1 ותקן ישראלי 5568
          ומשפרים את הנגישות באופן מתמשך.
        </p>
      </section>

      <section id="status">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. מצב נגישות נוכחי</h2>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900 mb-4">
          <strong>הצהרת ביניים:</strong> המערכת מיישמת עקרונות נגישות בסיסיים. בדיקת נגישות מקצועית
          מלאה טרם בוצעה. אין לפרש מסמך זה כהצהרת עמידה מלאה בתקן WCAG AA או ת&rdquo;י 5568.
        </div>

        <p className="text-gray-700 leading-relaxed mb-3">יישום נוכחי כולל:</p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>תמיכה מלאה ב-RTL ובשפה העברית בכל ממשקי המערכת</li>
          <li>שימוש ב-Semantic HTML (heading hierarchy, landmark roles)</li>
          <li>תוויות <code className="text-xs bg-gray-100 px-1 rounded">aria-label</code> ו-<code className="text-xs bg-gray-100 px-1 rounded">aria-required</code> לאלמנטים אינטראקטיביים</li>
          <li>ניווט מקלדת בממשקים העיקריים (login, רשימת עובדים, טפסים)</li>
          <li>בדיקת ניגודיות צבע ראשונית — טרם אומתה מול WCAG AA</li>
          <li><code className="text-xs bg-gray-100 px-1 rounded">role=&quot;alert&quot;</code> ו-<code className="text-xs bg-gray-100 px-1 rounded">aria-live</code> בהודעות שגיאה מרכזיות</li>
        </ul>

        <p className="text-gray-500 text-sm mt-4">
          תאריך בדיקה פנימית אחרונה: {LEGAL.accessibilityLastAudit}
        </p>
      </section>

      <section id="limitations">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. מגבלות ידועות</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          המגבלות הבאות זוהו בבדיקה הפנימית ונמצאות בתהליך טיפול:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>ניהול focus במודלים ובחלונות קופצים אינו מיטבי לכלל קוראי המסך</li>
          <li>חלק מהטפסים אינם מסמנים שדות חובה באמצעות ARIA בצורה עקבית</li>
          <li>הודעות שגיאה מסוימות אינן מכוסות ב-<code className="text-xs bg-gray-100 px-1 rounded">aria-live</code></li>
          <li>בדיקה עם קוראי מסך (NVDA, VoiceOver) לא בוצעה במלואה</li>
          <li>ניגודיות צבע בחלק מהרכיבים עדיין מאומתת</li>
        </ul>
      </section>

      <section id="tech">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. טכנולוגיות נתמכות</h2>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li><strong>דפדפנים:</strong> Chrome, Edge, Firefox, Safari — גרסאות עדכניות</li>
          <li><strong>מכשירים:</strong> Desktop, Tablet, Mobile (iOS Safari, Android Chrome)</li>
          <li><strong>קוראי מסך:</strong> NVDA (Windows), VoiceOver (iOS / macOS) — בבדיקה חלקית בלבד</li>
        </ul>
      </section>

      <section id="feedback">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. משוב ודיווח על בעיות</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          נתקלת בבעיית נגישות? נשמח לשמוע ולטפל בה.
          החברה תעשה מאמץ להגיב לפניות נגישות בהקדם האפשרי בהתאם לאופי הבעיה.
        </p>
        <address className="not-italic text-gray-700 space-y-1">
          <p>
            <strong>אימייל:</strong>{' '}
            <a href={`mailto:${LEGAL.accessibilityContactEmail}`} className="text-orange-700 underline">
              {LEGAL.accessibilityContactEmail}
            </a>
          </p>
          <p>
            <strong>טלפון:</strong>{' '}
            <a href={`tel:${LEGAL.companyPhone}`} className="text-orange-700 underline">
              {LEGAL.companyPhone}
            </a>
          </p>
        </address>
        <p className="text-gray-700 leading-relaxed mt-3">
          בפנייה, נא לפרט: תיאור הבעיה, הדפדפן/מכשיר בו השתמשת, ואם רלוונטי — שם קורא המסך.
        </p>
      </section>

      <section id="regulation">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">6. תקנות ורגולציה</h2>
        <p className="text-gray-700 leading-relaxed">
          הצהרה זו מוגשת בהתאם לדרישות תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות),
          התשע&rdquo;ג-2013 ותקן ישראלי 5568 (המבוסס על WCAG 2.1).
          הצהרה זו היא ביניים ותעודכן לאחר ביצוע audit נגישות מקצועי מלא.
        </p>
        <p className="text-gray-500 text-sm mt-2">
          גרסת הצהרה: {LEGAL.accessibilityVersion} | עדכון: {LEGAL.termsEffectiveDate}
        </p>
      </section>

    </LegalPageLayout>
  );
}
