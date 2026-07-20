import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';

export const metadata: Metadata = { title: `מדיניות פרטיות — ${LEGAL.productName}` };

const toc = [
  { id: 'who-we-are',       label: 'מי אנחנו' },
  { id: 'data-collected',   label: 'מידע שאנחנו אוספים' },
  { id: 'purposes',         label: 'מטרות עיבוד המידע' },
  { id: 'legal-basis',      label: 'בסיס משפטי לעיבוד' },
  { id: 'sharing',          label: 'שיתוף מידע' },
  { id: 'retention',        label: 'שמירת מידע' },
  { id: 'security',         label: 'אבטחת מידע' },
  { id: 'cookies',          label: 'עוגיות (Cookies)' },
  { id: 'rights',           label: 'זכויות נושאי המידע' },
  { id: 'location',         label: 'מיקום הנתונים' },
  { id: 'changes',          label: 'שינויים במדיניות' },
  { id: 'contact',          label: 'יצירת קשר' },
];

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="מדיניות פרטיות"
      version={LEGAL.privacyVersion}
      effectiveDate={LEGAL.termsEffectiveDate}
      summary={`מסמך זה מסביר כיצד ${LEGAL.companyName} אוספת, מעבדת ושומרת מידע אישי של עובדים ומשתמשי מערכת SafeDoc. המידע נאסף לצורך ניהול בטיחות בעבודה בלבד ולא נמכר או מועבר לגורמי שיווק.`}
      toc={toc}
      prevPage={{ href: '/terms', label: 'תנאי שימוש' }}
      nextPage={{ href: '/subprocessors', label: 'ספקי משנה' }}
    >

      {/* 1 */}
      <section id="who-we-are">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. מי אנחנו</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          {LEGAL.companyName} (&ldquo;החברה&rdquo;, &ldquo;אנחנו&rdquo;) מפעילה את מערכת SafeDoc
          לניהול מסמכי בטיחות בסביבות בנייה. החברה היא &ldquo;מחזיק מאגר&rdquo; ו&ldquo;גורם מתפעל&rdquo;
          כמשמעם בחוק הגנת הפרטיות, התשמ&rdquo;א-1981 (&ldquo;חוק הגנת הפרטיות&rdquo;).
        </p>
        <address className="not-italic text-gray-700 space-y-1 text-sm">
          <p><strong>{LEGAL.companyName}</strong></p>
          <p>ח.פ.: {LEGAL.companyRegistration}</p>
          <p>{LEGAL.companyAddress}</p>
          <p>
            לפניות בנושאי פרטיות:{' '}
            <a href={`mailto:${LEGAL.privacyContactEmail}`} className="text-orange-700 underline">
              {LEGAL.privacyContactEmail}
            </a>
          </p>
        </address>
      </section>

      {/* 2 */}
      <section id="data-collected">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. מידע שאנחנו אוספים</h2>

        <h3 className="font-semibold text-gray-800 mb-2">2.1 מידע על עובדים</h3>
        <p className="text-gray-700 leading-relaxed mb-2">
          המידע הבא נאסף לצורך ניהול בטיחות ועמידה בדרישות רגולטוריות:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed mb-4">
          <li>שם מלא, תעודת זהות ישראלית (לעובדים ישראלים) או מספר דרכון וסוג מסמך זהות (לעובדים זרים)</li>
          <li>תמונת פנים (נאספת לצורך זיהוי וניהול)</li>
          <li>מספר טלפון (אופציונלי)</li>
          <li>מסמכים: רישיון, אשרת עבודה (לעובדים זרים), היתר עבודה בגובה — לרבות תאריכי תוקף</li>
          <li>הערות תפעוליות שהוזנו על ידי מנהלי המערכת</li>
        </ul>

        <h3 className="font-semibold text-gray-800 mb-2">2.2 מידע על משתמשי המערכת (מנהלים ומורשים)</h3>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed mb-4">
          <li>שם מלא, כתובת דוא&rdquo;ל, שם משתמש</li>
          <li>לוגים של פעולות במערכת (audit trail) — כולל זמן, פעולה וכתובת IP</li>
          <li>רשומות הסכמה לתנאי שימוש ומדיניות פרטיות (גרסה, תאריך, כתובת IP)</li>
        </ul>

        <h3 className="font-semibold text-gray-800 mb-2">2.3 מידע טכני אוטומטי</h3>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>כתובות IP ו-User-Agent של הדפדפן — נאספים בעת כניסה ופעולות רגישות</li>
          <li>לוגי שרת מוצפנים — בתשתית Vercel ו-Supabase בהתאם למדיניותם</li>
        </ul>
      </section>

      {/* 3 */}
      <section id="purposes">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. מטרות עיבוד המידע</h2>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>ניהול ציות לדרישות בטיחות בעבודה על פי פקודת הבטיחות בעבודה (נוסח חדש) ותקנות הנלוות</li>
          <li>מעקב אחר תוקף מסמכי עובדים ושליחת התרעות לגורמים המורשים בחברה</li>
          <li>הפקת דוחות ניהוליים לצורכי בטיחות פנימית</li>
          <li>ניהול הרשאות גישה ואבטחת המערכת</li>
          <li>תיעוד פעולות לצרכי ביקורת ואחריות תאגידית</li>
        </ul>
      </section>

      {/* 4 */}
      <section id="legal-basis">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. בסיס משפטי לעיבוד</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200 text-right">
                <th className="py-2 px-3 font-semibold text-gray-900">סוג מידע</th>
                <th className="py-2 px-3 font-semibold text-gray-900">בסיס משפטי</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100">
                <td className="py-2.5 px-3">מסמכי זהות ועבודה</td>
                <td className="py-2.5 px-3">חובה חוקית — פקודת הבטיחות בעבודה</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2.5 px-3">תמונות עובדים</td>
                <td className="py-2.5 px-3">הבסיס המשפטי ייקבע בהתאם לאופן השימוש ולנסיבות — לבחינה משפטית</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2.5 px-3">נתוני ניהול ודוחות</td>
                <td className="py-2.5 px-3">אינטרס לגיטימי — ניהול תפעולי ובטיחות האתר</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2.5 px-3">לוגי audit ואבטחה</td>
                <td className="py-2.5 px-3">חובה חוקית + אינטרס לגיטימי</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2.5 px-3">רשומות הסכמה</td>
                <td className="py-2.5 px-3">חובה חוקית — תיעוד הסכמה לפי חוק הגנת הפרטיות</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          * בסיסי עיבוד אלו הם טיוטה ראשונית — יש לאמת עם עורך דין המתמחה בפרטיות לפני מסחור.
        </p>
      </section>

      {/* 5 */}
      <section id="sharing">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. שיתוף מידע</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          המידע <strong>אינו נמכר</strong> ואינו מועבר לצדדים שלישיים לצורכי שיווק, פרסום, או כל מטרה
          שאינה מפורטת במדיניות זו. המידע עשוי להיות מועבר:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>
            <strong>ספקי תשתית טכנית</strong> — בכפוף להסכמים חוזיים.
            ראה{' '}
            <a href="/subprocessors" className="text-orange-700 underline">רשימת ספקי משנה</a>{' '}
            לפרטים.
          </li>
          <li>
            <strong>רשויות ממשלתיות</strong> — בהתאם לדרישה חוקית או צו שיפוטי בלבד.
          </li>
          <li>
            <strong>גורמים מורשים בחברה</strong> — מנהלי אתר ובעלי תפקיד רלוונטי בלבד.
          </li>
        </ul>
      </section>

      {/* 6 */}
      <section id="retention">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">6. שמירת מידע</h2>
        <p className="text-gray-700 leading-relaxed">
          המידע נשמר בהתאם ל
          <a href="/data-retention" className="text-orange-700 underline">מדיניות שמירת המידע המלאה</a>.
          בתמצית: נתוני עובדים נשמרים לתקופת ההעסקה ו-{LEGAL.retentionWorkerDataYears} שנים לאחריה;
          לוגי audit נשמרים {LEGAL.retentionAuditLogsYears} שנים; session cookies בתוקף ל-{LEGAL.retentionSessionDays} ימים.
          בתום תקופת השמירה, מידע יימחק או יאנונמז.
        </p>
      </section>

      {/* 7 */}
      <section id="security">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">7. אבטחת מידע</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          {LEGAL.companyName} נוקטת באמצעי אבטחה טכניים וארגוניים להגנת המידע:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>הצפנת כל תעבורה בין הדפדפן לשרתים (HTTPS/TLS)</li>
          <li>קבצי עובדים מאוחסנים ב-private storage עם Signed URLs בלבד — אין גישה ישירה ציבורית</li>
          <li>גישה למערכת מוגבלת למשתמשים מורשים עם פרטי כניסה ייחודיים</li>
          <li>session cookies מוגדרים כ-HttpOnly, Secure, SameSite=Lax</li>
          <li>לוגי audit לתיעוד פעולות רגישות</li>
          <li>הפרדת הרשאות — admin vs. user</li>
        </ul>
        <p className="text-gray-700 leading-relaxed mt-3">
          לדוח אבטחה מפורט, ראה{' '}
          <a href="/about" className="text-orange-700 underline">אודות המערכת</a>.
        </p>
      </section>

      {/* 8 */}
      <section id="cookies">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">8. עוגיות (Cookies)</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          המערכת משתמשת בשתי עוגיות הכרחיות לפעילותה בלבד. אין שימוש ב-cookies של שיווק, מעקב, analytics,
          או כל צד שלישי.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200 text-right">
                <th className="py-2 px-3 font-semibold text-gray-900">שם</th>
                <th className="py-2 px-3 font-semibold text-gray-900">מטרה</th>
                <th className="py-2 px-3 font-semibold text-gray-900">תוקף</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100">
                <td className="py-2.5 px-3 font-mono text-xs">safedoc_session</td>
                <td className="py-2.5 px-3">אימות הכניסה ושמירת session (HttpOnly, Secure)</td>
                <td className="py-2.5 px-3">{LEGAL.retentionSessionDays} ימים</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2.5 px-3 font-mono text-xs">safedoc_consented</td>
                <td className="py-2.5 px-3">תיעוד גרסת תנאים שאושרה (HttpOnly, Secure)</td>
                <td className="py-2.5 px-3">שנה</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 9 */}
      <section id="rights">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">9. זכויות נושאי המידע</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          עובד שמידע אישי שלו מעובד במערכת רשאי לממש את הזכויות הבאות, בכפוף לחוק הגנת הפרטיות
          ולחובות שמירה חוקיות:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed mb-3">
          <li><strong>עיון</strong> — בקשה לראות את המידע המוחזק אודותיו</li>
          <li><strong>תיקון</strong> — בקשה לתקן מידע שגוי או לא עדכני</li>
          <li><strong>מחיקה</strong> — בקשה למחיקת מידע (בכפוף לחובות שמירה חוקיות)</li>
          <li><strong>התנגדות</strong> — התנגדות לעיבוד המידע לצרכים ספציפיים</li>
          <li><strong>ניידות</strong> — קבלת המידע בפורמט מובנה (לפי שיקול דעת החברה)</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          בקשות יש לשלוח בכתב אל:{' '}
          <a href={`mailto:${LEGAL.privacyContactEmail}`} className="text-orange-700 underline">
            {LEGAL.privacyContactEmail}
          </a>
          . החברה תשיב תוך 30 יום.
        </p>
      </section>

      {/* 10 */}
      <section id="location">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">10. מיקום הנתונים</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          הנתונים מאוחסנים בשרתי Supabase באזור{' '}
          <strong>ap-northeast-1 (Tokyo, Japan)</strong> בתשתית AWS.
          תשתית הגשת האפליקציה מסופקת על ידי Vercel בתשתית גלובלית.
        </p>
        <p className="text-gray-700 leading-relaxed">
          העברת נתונים מחוץ לישראל מתבצעת בהסתמך על:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed mt-2">
          <li>הסכמי עיבוד נתונים (DPA) עם ספקי התשתית</li>
          <li>מדיניות הפרטיות של ספקי המשנה — ראה{' '}
            <a href="/subprocessors" className="text-orange-700 underline">רשימת ספקי משנה</a>
          </li>
        </ul>
      </section>

      {/* 11 */}
      <section id="changes">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">11. שינויים במדיניות</h2>
        <p className="text-gray-700 leading-relaxed">
          מדיניות זו עשויה להתעדכן מעת לעת. שינויים מהותיים יוצגו למשתמשים לפני כניסתם לתוקף
          וידרשו אישור מחדש. הגרסה הנוכחית: <strong>{LEGAL.privacyVersion}</strong>,
          תאריך תחולה: {LEGAL.termsEffectiveDate}.
        </p>
      </section>

      {/* 12 */}
      <section id="contact">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">12. יצירת קשר</h2>
        <p className="text-gray-700 leading-relaxed">
          לשאלות, בקשות מימוש זכויות, או פניות בנושאי פרטיות:
        </p>
        <address className="not-italic text-gray-700 mt-2 space-y-1">
          <p><strong>{LEGAL.companyName}</strong></p>
          <p>
            אימייל:{' '}
            <a href={`mailto:${LEGAL.privacyContactEmail}`} className="text-orange-700 underline">
              {LEGAL.privacyContactEmail}
            </a>
          </p>
          <p>
            טלפון:{' '}
            <a href={`tel:${LEGAL.companyPhone}`} className="text-orange-700 underline">
              {LEGAL.companyPhone}
            </a>
          </p>
        </address>
      </section>

    </LegalPageLayout>
  );
}
