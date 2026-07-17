import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';

export const metadata: Metadata = { title: `ספקי משנה — ${LEGAL.productName}` };

export default function SubprocessorsPage() {
  return (
    <LegalPageLayout
      title="ספקי משנה (Sub-Processors)"
      effectiveDate={LEGAL.termsEffectiveDate}
      summary={`${LEGAL.companyName} משתמשת בספקי תשתית חיצוניים לצורך הפעלת ${LEGAL.productName}. ספקים אלה עשויים לעבד מידע אישי. להלן הרשימה המלאה, כולל מיקום עיבוד הנתונים וקישור למדיניות הפרטיות של כל ספק.`}
      prevPage={{ href: '/privacy', label: 'מדיניות פרטיות' }}
      nextPage={{ href: '/data-retention', label: 'מדיניות שמירת מידע' }}
    >
      <section>
        <p className="text-gray-700 leading-relaxed">
          {LEGAL.companyName} משתמשת בספקי שירות חיצוניים (sub-processors) לצורך הפעלת {LEGAL.productName}.
          ספקים אלה עשויים לעבד מידע אישי שנאסף במערכת בהתאם להוראות {LEGAL.companyName} ולהסכמים
          חוזיים עמם. להלן רשימה מלאה ועדכנית:
        </p>
      </section>

      <section>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200 text-right">
                <th className="py-2 px-3 font-semibold text-gray-900">ספק</th>
                <th className="py-2 px-3 font-semibold text-gray-900">מטרה</th>
                <th className="py-2 px-3 font-semibold text-gray-900">מיקום עיבוד</th>
                <th className="py-2 px-3 font-semibold text-gray-900">מדיניות</th>
              </tr>
            </thead>
            <tbody>
              {LEGAL.subprocessors.map((sp) => (
                <tr key={sp.name} className="border-b border-gray-100">
                  <td className="py-2.5 px-3 font-medium text-gray-900">{sp.name}</td>
                  <td className="py-2.5 px-3 text-gray-700">{sp.purpose}</td>
                  <td className="py-2.5 px-3 text-gray-700">{sp.country}</td>
                  <td className="py-2.5 px-3">
                    <a
                      href={sp.dpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-600 hover:underline text-xs"
                    >
                      פרטי פרטיות ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 id="dpa" className="text-lg font-semibold text-gray-900 mb-3">הסכמי עיבוד נתונים (DPA)</h2>
        <p className="text-gray-700 leading-relaxed">
          {LEGAL.companyName} פועלת לחתום על הסכמי עיבוד נתונים (Data Processing Agreements) עם
          ספקי המשנה הרלוונטיים. הסכמים אלה מבטיחים שהספקים מעבדים מידע אישי בהתאם להוראותינו
          ולדרישות הדין החל. לפרטים, פנה אל{' '}
          <a href={`mailto:${LEGAL.privacyContactEmail}`} className="text-orange-600 hover:underline">
            {LEGAL.privacyContactEmail}
          </a>.
        </p>
      </section>

      <section>
        <h2 id="changes" className="text-lg font-semibold text-gray-900 mb-3">שינויים ברשימה</h2>
        <p className="text-gray-700 leading-relaxed">
          {LEGAL.companyName} תודיע על הוספת ספקי משנה חדשים לפחות 30 יום לפני תחילת העיבוד,
          כדי לאפשר התנגדות בכתב. שינויים ברשימה יעודכנו בדף זה.
          תאריך עדכון אחרון: {LEGAL.termsEffectiveDate}.
        </p>
      </section>

      <section>
        <h2 id="contact" className="text-lg font-semibold text-gray-900 mb-3">שאלות</h2>
        <p className="text-gray-700 leading-relaxed">
          לשאלות בנוגע לספקי משנה, עיבוד נתונים, או בקשה לעיין בהסכמי DPA:{' '}
          <a href={`mailto:${LEGAL.privacyContactEmail}`} className="text-orange-600 hover:underline">
            {LEGAL.privacyContactEmail}
          </a>
        </p>
      </section>
    </LegalPageLayout>
  );
}
