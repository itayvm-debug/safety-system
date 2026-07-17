/**
 * ⚠️ DRAFT — טיוטה לסקירת עורך דין בלבד. אין לפרסם ללא אישור משפטי.
 */
import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';

export const metadata: Metadata = { title: `מדיניות פרטיות — ${LEGAL.productName}` };

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="מדיניות פרטיות"
      version={LEGAL.termsVersion}
      effectiveDate={LEGAL.termsEffectiveDate}
    >
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm mb-8">
        ⚠️ <strong>טיוטה — לסקירת עורך דין בלבד.</strong> מסמך זה טרם עבר סקירה משפטית ואינו תקף עדיין.
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. מי אנחנו</h2>
        <p className="text-gray-700 leading-relaxed">
          {LEGAL.companyName} (&ldquo;החברה&rdquo;, &ldquo;אנחנו&rdquo;) מפעילה את מערכת SafeDoc
          לניהול מסמכי בטיחות בסביבות בנייה. החברה היא &ldquo;בעל מאגר&rdquo; כמשמעו בחוק הגנת הפרטיות,
          התשמ&rdquo;א-1981.
        </p>
        <p className="text-gray-700 leading-relaxed mt-2">
          לפניות בנושאי פרטיות: <a href={`mailto:${LEGAL.privacyContactEmail}`} className="text-orange-600 hover:underline">{LEGAL.privacyContactEmail}</a>
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. איזה מידע אנחנו אוספים</h2>

        <h3 className="font-medium text-gray-800 mb-2">2.1 מידע על עובדים</h3>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed mb-4">
          <li>שם מלא, תעודת זהות ישראלית / מספר דרכון (לעובדים זרים)</li>
          <li>תמונה (מידע ביומטרי)</li>
          <li>מספר טלפון (אופציונלי), כתובת (לצורך מינוי מפעיל), שנת לידה, שם האב, מקצוע</li>
          <li>מסמכי רישיון, אשרת עבודה, היתר עבודה בגובה</li>
          <li>תדריכי בטיחות וחתימות דיגיטליות (מידע ביומטרי)</li>
          <li>הערות תפעוליות (עשויות לכלול מידע בריאותי)</li>
        </ul>

        <h3 className="font-medium text-gray-800 mb-2">2.2 מידע על משתמשי המערכת</h3>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed mb-4">
          <li>שם מלא, כתובת אימייל, מספר טלפון (לצורך הרשאה)</li>
          <li>לוגים של פעולות במערכת (audit trail)</li>
        </ul>

        <h3 className="font-medium text-gray-800 mb-2">2.3 מידע טכני</h3>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>כתובות IP, מזהי session, לוגי גישה</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. מטרות עיבוד המידע</h2>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>ניהול ציות לדרישות בטיחות בעבודה על פי דין</li>
          <li>הפקת דוחות ניהוליים לבטיחות האתר</li>
          <li>ניהול הרשאות גישה למערכת</li>
          <li>שליחת התרעות ודוחות למורשי החברה</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. בסיס משפטי לעיבוד</h2>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li><strong>חובה חוקית</strong> — פקודת הבטיחות בעבודה (נוסח חדש), תקנות הבטיחות בעבודה</li>
          <li><strong>הסכמה</strong> — איסוף תמונות וחתימות דיגיטליות (מידע ביומטרי)</li>
          <li><strong>אינטרס לגיטימי</strong> — ניהול תפעולי של האתר</li>
        </ul>
        <p className="text-gray-500 text-sm mt-2">
          ⚠️ TODO: לאמת בסיסי עיבוד עם עורך דין, במיוחד לגבי תמונות וחתימות.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. שיתוף מידע</h2>
        <p className="text-gray-700 leading-relaxed">
          המידע אינו נמכר או מועבר לצדדים שלישיים לצרכי שיווק. המידע עשוי להיות מועבר:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed mt-2">
          <li>לספקי תשתית טכנית (ראה <a href="/subprocessors" className="text-orange-600 hover:underline">רשימת ספקי משנה</a>)</li>
          <li>לרשויות ממשלתיות לפי דרישה חוקית</li>
          <li>בכפוף להסכם עיבוד נתונים (DPA) עם כל ספק</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">6. שמירת מידע</h2>
        <p className="text-gray-700 leading-relaxed">
          המידע נשמר בהתאם ל<a href="/data-retention" className="text-orange-600 hover:underline">מדיניות שמירת מידע</a>.
          נתוני עובדים נשמרים למשך תקופת ההעסקה ו-{LEGAL.retentionWorkerDataYears} שנים לאחריה,
          בהתאם לדרישות חוק. ⚠️ TODO: לאמת עם עורך דין.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">7. אבטחת מידע</h2>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>הצפנת תעבורה (HTTPS/TLS)</li>
          <li>קבצים מאוחסנים ב-private storage עם signed URLs בלבד</li>
          <li>גישה למערכת מוגבלת לטלפונים מורשים + סיסמה</li>
          <li>לוגי audit (בפיתוח)</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">8. זכויות הנושאים</h2>
        <p className="text-gray-700 leading-relaxed mb-2">
          עובד שמידע אישי שלו מעובד במערכת רשאי לבקש:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>עיון במידע</li>
          <li>תיקון מידע שגוי</li>
          <li>מחיקת מידע (בכפוף לחובות שמירה חוקיות)</li>
          <li>התנגדות לעיבוד</li>
        </ul>
        <p className="text-gray-700 leading-relaxed mt-2">
          בקשות יש לשלוח ל: <a href={`mailto:${LEGAL.privacyContactEmail}`} className="text-orange-600 hover:underline">{LEGAL.privacyContactEmail}</a>
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">9. מיקום הנתונים</h2>
        <p className="text-gray-700 leading-relaxed">
          הנתונים מאוחסנים בשרתי Supabase. ⚠️ TODO: לאמת אזור ספציפי ולהוסיף כאן.
          אם הנתונים מועברים מחוץ לישראל/אירופה, מתקיים מנגנון העברה חוקי (SCCs / הסכם DPA מתאים).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">10. קובצי Cookie</h2>
        <p className="text-gray-700 leading-relaxed">
          המערכת משתמשת ב-session cookie אחד בלבד (HttpOnly, Secure, SameSite=Lax) לצורך
          שמירת מצב ההתחברות. אין שימוש ב-cookies של שיווק, מעקב, או analytics.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">11. שינויים במדיניות</h2>
        <p className="text-gray-700 leading-relaxed">
          מדיניות זו עשויה להתעדכן מעת לעת. שינויים מהותיים יוצגו לפני כניסתם לתוקף.
        </p>
      </section>
    </LegalPageLayout>
  );
}
