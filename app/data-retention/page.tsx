import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';

export const metadata: Metadata = { title: `מדיניות שמירת מידע — ${LEGAL.productName}` };

const rows = [
  {
    category: 'נתוני עובדים (פרטים אישיים, זהות)',
    table: 'workers',
    retention: `תקופת ההעסקה + ${LEGAL.retentionWorkerDataYears} שנים`,
    basis: 'חובה חוקית — פקודת הבטיחות בעבודה',
  },
  {
    category: 'מסמכי עובדים (קבצים בענן)',
    table: 'documents + Storage',
    retention: `${LEGAL.retentionDocumentFilesYears} שנים מתאריך העלאה`,
    basis: 'חובה חוקית + אינטרס לגיטימי',
  },
  {
    category: 'תדריכי בטיחות',
    table: 'safety_briefings',
    retention: 'שנה מתאריך תפוגה',
    basis: 'חובה חוקית',
  },
  {
    category: 'מינויי מפעיל מכונה',
    table: 'lifting_machine_appointments',
    retention: '7 שנים (מסמך משפטי)',
    basis: 'חובה חוקית',
  },
  {
    category: 'נתוני רכבים, ציוד כבד וציוד הרמה',
    table: 'vehicles, heavy_equipment, lifting_equipment',
    retention: 'לאורך תקופת הפעילות + 3 שנים',
    basis: 'אינטרס לגיטימי',
  },
  {
    category: 'הערות ישויות',
    table: 'entity_notes',
    retention: 'עד מחיקה ידנית (בהמשך: יוגדר retention אוטומטי)',
    basis: 'אינטרס לגיטימי',
  },
  {
    category: 'פרופילי משתמשי מערכת',
    table: 'profiles',
    retention: 'תקופת ההרשאה + שנה',
    basis: 'אינטרס לגיטימי',
  },
  {
    category: 'רשומות הסכמה משפטית',
    table: 'legal_acceptances',
    retention: '7 שנים מיום ההסכמה',
    basis: 'חובה חוקית — תיעוד הסכמה',
  },
  {
    category: 'לוגי audit',
    table: 'audit_logs',
    retention: `${LEGAL.retentionAuditLogsYears} שנים`,
    basis: 'חובה חוקית + הגנה משפטית',
  },
  {
    category: 'Session cookies',
    table: 'Cookie דפדפן',
    retention: `${LEGAL.retentionSessionDays} ימים`,
    basis: 'הכרחי לפעילות המערכת',
  },
  {
    category: 'לוגי תשתית (Vercel & Supabase)',
    table: 'לוגי ספק תשתית',
    retention: 'לפי מדיניות הספק — בדרך כלל 30–90 יום',
    basis: 'אינטרס לגיטימי / חוזה ספק',
  },
];

export default function DataRetentionPage() {
  return (
    <LegalPageLayout
      title="מדיניות שמירת מידע"
      version={LEGAL.termsVersion}
      effectiveDate={LEGAL.termsEffectiveDate}
      summary={`${LEGAL.companyName} שומרת מידע לפרקי זמן המתחייבים מהדין ומצרכים תפעוליים לגיטימיים. תקופות השמירה מפורטות להלן. מסמך זה הוא טיוטה — יש לאמת מול עורך דין לפני הסחרה.`}
      prevPage={{ href: '/subprocessors', label: 'ספקי משנה' }}
      nextPage={{ href: '/accessibility', label: 'הצהרת נגישות' }}
    >

      <section>
        <p className="text-gray-700 leading-relaxed">
          {LEGAL.companyName} שומרת מידע לפרקי זמן המתחייבים מדרישות חוק הבטיחות בעבודה,
          חוק הגנת הפרטיות, וצרכים תפעוליים לגיטימיים. בתום תקופת השמירה, מידע יימחק או יאנונמז.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">טבלת שמירה לפי קטגוריות</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200 text-right">
                <th className="py-2 px-3 font-semibold text-gray-900">קטגוריה</th>
                <th className="py-2 px-3 font-semibold text-gray-900">תקופת שמירה</th>
                <th className="py-2 px-3 font-semibold text-gray-900 hidden sm:table-cell">בסיס</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category} className="border-b border-gray-100">
                  <td className="py-2.5 px-3">
                    <p className="font-medium text-gray-900">{r.category}</p>
                    <p className="text-xs text-gray-600">{r.table}</p>
                  </td>
                  <td className="py-2.5 px-3 text-gray-700">{r.retention}</td>
                  <td className="py-2.5 px-3 text-gray-500 text-xs hidden sm:table-cell">{r.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          * תקופות שמירה אלו הן טיוטה ראשונית ויש לאמת אותן עם עורך דין המתמחה בדיני עבודה ופרטיות לפני מסחור.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">מחיקה ואנונימיזציה</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          בתום תקופת השמירה, מידע יטופל באחת מהדרכים הבאות:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li><strong>מחיקה</strong> — הסרת הנתונים מהמסד לצמיתות</li>
          <li><strong>אנונימיזציה</strong> — הסרת מזהים אישיים תוך שמירת נתונים מצטברים לצורכי סטטיסטיקה</li>
        </ul>
        <p className="text-gray-700 leading-relaxed mt-3">
          כיום, מחיקה מבוצעת ידנית על ידי מנהלי המערכת. בפיתוח עתידי יוטמע מנגנון מחיקה אוטומטית.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">בקשת מחיקה</h2>
        <p className="text-gray-700 leading-relaxed">
          לבקשת מחיקת מידע אישי (בכפוף לחובות שמירה חוקיות), ניתן לפנות אל:{' '}
          <a href={`mailto:${LEGAL.privacyContactEmail}`} className="text-orange-700 underline">
            {LEGAL.privacyContactEmail}
          </a>.
          המפעיל ישיב בתוך זמן סביר ויפרט אילו נתונים ניתן למחוק ואילו חייבים להישמר על פי דין.
        </p>
      </section>

    </LegalPageLayout>
  );
}
