/**
 * ⚠️ DRAFT — טיוטה לסקירת עורך דין בלבד. תקופות שמירה לא אושרו.
 */
import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';

export const metadata: Metadata = { title: `מדיניות שמירת מידע — ${LEGAL.productName}` };

const rows = [
  {
    category: 'נתוני עובדים (פרטים אישיים, זהות)',
    table: 'workers',
    retention: `תקופת ההעסקה + ${LEGAL.retentionWorkerDataYears} שנים`,
    basis: 'חובה חוקית (פקודת הבטיחות בעבודה)',
    note: 'TODO: לאמת עם עורך דין',
  },
  {
    category: 'מסמכי עובדים (קבצים בענן)',
    table: 'documents + Storage',
    retention: `${LEGAL.retentionDocumentFilesYears} שנים מתאריך העלאה`,
    basis: 'חובה חוקית + אינטרס לגיטימי',
    note: 'TODO: לאמת',
  },
  {
    category: 'תדריכי בטיחות',
    table: 'safety_briefings',
    retention: 'שנה מתאריך תפוגה',
    basis: 'חובה חוקית',
    note: 'TODO: לאמת',
  },
  {
    category: 'מינויי מפעיל מכונה',
    table: 'lifting_machine_appointments',
    retention: '7 שנים (מסמך משפטי)',
    basis: 'חובה חוקית',
    note: 'TODO: לאמת עם ממשרד העבודה',
  },
  {
    category: 'נתוני רכבים וציוד',
    table: 'vehicles, heavy_equipment, lifting_equipment',
    retention: 'לאורך תקופת הפעילות + 3 שנים',
    basis: 'אינטרס לגיטימי',
    note: 'TODO: לאמת',
  },
  {
    category: 'הערות ישויות',
    table: 'entity_notes',
    retention: 'עד מחיקה ידנית',
    basis: 'אינטרס לגיטימי',
    note: 'יש לשקול retention policy אוטומטי',
  },
  {
    category: 'פרופילי משתמשים',
    table: 'profiles',
    retention: 'תקופת ההרשאה + 1 שנה',
    basis: 'אינטרס לגיטימי',
    note: '',
  },
  {
    category: 'לוגי audit',
    table: 'audit_logs (עתידי)',
    retention: `${LEGAL.retentionAuditLogsYears} שנים`,
    basis: 'חובה חוקית + הגנה משפטית',
    note: '',
  },
  {
    category: 'Session cookies',
    table: 'Cookie דפדפן',
    retention: `${LEGAL.retentionSessionDays} ימים`,
    basis: 'הכרחי לפעילות המערכת',
    note: '',
  },
  {
    category: 'Vercel & Supabase logs',
    table: 'לוגי ספק תשתית',
    retention: 'לפי מדיניות הספק (בדרך כלל 30–90 יום)',
    basis: 'אינטרס לגיטימי / חוזה ספק',
    note: 'TODO: לאמת מול תנאי Vercel ו-Supabase',
  },
];

export default function DataRetentionPage() {
  return (
    <LegalPageLayout
      title="מדיניות שמירת מידע"
      version={LEGAL.termsVersion}
      effectiveDate={LEGAL.termsEffectiveDate}
    >
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm mb-8">
        ⚠️ <strong>טיוטה — לסקירת עורך דין בלבד.</strong>
        תקופות השמירה מפורטות כהצעה ראשונית ויש לאמת אותן מול עורך דין המתמחה בדיני עבודה ופרטיות.
      </div>

      <section>
        <p className="text-gray-700 leading-relaxed">
          {LEGAL.companyName} שומרת מידע לפרקי זמן המתחייבים מהדין ומצרכים תפעוליים לגיטימיים.
          להלן טבלת השמירה לפי קטגוריות:
        </p>
      </section>

      <section>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200 text-right">
                <th className="py-2 px-3 font-semibold text-gray-900">קטגוריה</th>
                <th className="py-2 px-3 font-semibold text-gray-900">תקופת שמירה</th>
                <th className="py-2 px-3 font-semibold text-gray-900">בסיס</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category} className="border-b border-gray-100">
                  <td className="py-2.5 px-3">
                    <p className="font-medium text-gray-900">{r.category}</p>
                    <p className="text-xs text-gray-400">{r.table}</p>
                    {r.note && <p className="text-xs text-amber-600 mt-0.5">⚠️ {r.note}</p>}
                  </td>
                  <td className="py-2.5 px-3 text-gray-700">{r.retention}</td>
                  <td className="py-2.5 px-3 text-gray-500 text-xs">{r.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">מחיקה</h2>
        <p className="text-gray-700 leading-relaxed">
          בתום תקופת השמירה, מידע יימחק או יאנונמז.
          כיום מחיקה מבוצעת ידנית על ידי מנהלי המערכת.
          בפיתוח עתידי: מחיקה אוטומטית לפי מדיניות זו.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">בקשת מחיקה</h2>
        <p className="text-gray-700 leading-relaxed">
          לבקשת מחיקת מידע אישי (בכפוף לחובות שמירה חוקיות):{' '}
          <a href={`mailto:${LEGAL.privacyContactEmail}`} className="text-orange-600 hover:underline">
            {LEGAL.privacyContactEmail}
          </a>
        </p>
      </section>
    </LegalPageLayout>
  );
}
