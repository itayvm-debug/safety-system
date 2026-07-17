/**
 * ⚠️ DRAFT — טיוטה לסקירת עורך דין בלבד. אין לפרסם ללא אישור משפטי.
 */
import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';

export const metadata: Metadata = { title: `תנאי שימוש — ${LEGAL.productName}` };

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="תנאי שימוש"
      version={LEGAL.termsVersion}
      effectiveDate={LEGAL.termsEffectiveDate}
    >
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm mb-8">
        ⚠️ <strong>טיוטה — לסקירת עורך דין בלבד.</strong> מסמך זה טרם עבר סקירה משפטית ואינו תקף עדיין.
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. כללי</h2>
        <p className="text-gray-700 leading-relaxed">
          מערכת SafeDoc (&ldquo;המערכת&rdquo;) מופעלת על ידי {LEGAL.companyName} (&ldquo;החברה&rdquo;).
          השימוש במערכת כפוף לתנאים המפורטים במסמך זה. גישה למערכת ושימוש בה מהווים הסכמה לתנאים אלה.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. גישה למערכת</h2>
        <p className="text-gray-700 leading-relaxed">
          הגישה למערכת מותרת בלעדית לבעלי הרשאה מוקדמת מאת החברה. האחראים בחברה מנהלים את רשימת
          הגישה באופן שוטף. אין להעביר פרטי גישה לצד שלישי כלשהו.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. מטרת המערכת</h2>
        <p className="text-gray-700 leading-relaxed">
          המערכת מיועדת לניהול מסמכי בטיחות של עובדים באתרי בנייה, לצרכים תפעוליים ועמידה בדרישות
          חוק הבטיחות בעבודה. אין להשתמש במערכת לכל מטרה אחרת.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. הגבלת שימוש</h2>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>אין להכניס למערכת מידע כוזב, מזויף, או מטעה.</li>
          <li>אין לנסות לגשת לנתונים של גורמים אחרים.</li>
          <li>אין לנסות לעקוף מנגנוני אבטחה.</li>
          <li>אין להשתמש בכלים אוטומטיים (bots, scrapers) ללא אישור מפורש.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. מידע אישי</h2>
        <p className="text-gray-700 leading-relaxed">
          עיבוד מידע אישי מתבצע בהתאם למדיניות הפרטיות של המערכת. המשתמש האחראי על הזנת פרטי
          עובדים מחויב לוודא שנתקבלה הסכמת העובד ושהשימוש במידע עומד בהוראות חוק הגנת הפרטיות,
          התשמ&rdquo;א-1981.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">6. אחריות</h2>
        <p className="text-gray-700 leading-relaxed">
          המערכת מסופקת &ldquo;כפי שהיא&rdquo; (AS IS). החברה לא תישא באחריות לנזקים הנובעים
          מתקלות טכניות, מידע שגוי, או שימוש לא מורשה. האחריות על נכונות הנתונים המוזנים
          מוטלת על הגורמים המזינים אותם.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">7. זכויות קניין רוחני</h2>
        <p className="text-gray-700 leading-relaxed">
          כל הזכויות במערכת SafeDoc — לרבות הקוד, העיצוב, הלוגו, ומבנה הנתונים — שמורות ל-{LEGAL.companyName}.
          אין להעתיק, לשכפל, או להפיץ ללא אישור מראש ובכתב.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">8. שינויים בתנאים</h2>
        <p className="text-gray-700 leading-relaxed">
          החברה שומרת לעצמה את הזכות לשנות תנאים אלה בכל עת. המשך שימוש במערכת לאחר פרסום שינויים
          מהווה הסכמה לתנאים המעודכנים.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">9. דין חל וסמכות שיפוט</h2>
        <p className="text-gray-700 leading-relaxed">
          תנאים אלה כפופים לחוקי מדינת ישראל. סמכות השיפוט הבלעדית תהא לבתי המשפט המוסמכים בישראל.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">10. יצירת קשר</h2>
        <p className="text-gray-700 leading-relaxed">
          לשאלות בנוגע לתנאי השימוש: <a href={`mailto:${LEGAL.companyEmail}`} className="text-orange-600 hover:underline">{LEGAL.companyEmail}</a>
        </p>
      </section>
    </LegalPageLayout>
  );
}
