import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';

export const metadata: Metadata = { title: `ספקי משנה — ${LEGAL.productName}` };

export default function SubprocessorsPage() {
  return (
    <LegalPageLayout
      title="ספקי משנה (Sub-Processors)"
      effectiveDate={LEGAL.termsEffectiveDate}
    >
      <section>
        <p className="text-gray-700 leading-relaxed">
          {LEGAL.companyName} משתמשת בספקי שירות חיצוניים (sub-processors) לצורך הפעלת {LEGAL.productName}.
          ספקים אלה עשויים לעבד מידע אישי שנאסף במערכת. להלן רשימה מלאה:
        </p>
      </section>

      <section>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200 text-right">
                <th className="py-2 px-3 font-semibold text-gray-900">ספק</th>
                <th className="py-2 px-3 font-semibold text-gray-900">מטרה</th>
                <th className="py-2 px-3 font-semibold text-gray-900">מיקום</th>
                <th className="py-2 px-3 font-semibold text-gray-900">DPA</th>
              </tr>
            </thead>
            <tbody>
              {LEGAL.subprocessors.map((sp) => (
                <tr key={sp.name} className="border-b border-gray-100">
                  <td className="py-2.5 px-3">
                    <a href={sp.dpUrl} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline font-medium">
                      {sp.name}
                    </a>
                  </td>
                  <td className="py-2.5 px-3 text-gray-700">{sp.purpose}</td>
                  <td className="py-2.5 px-3 text-gray-700">{sp.country}</td>
                  <td className="py-2.5 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      sp.dpa.startsWith('TODO')
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {sp.dpa}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">שינויים ברשימה</h2>
        <p className="text-gray-700 leading-relaxed">
          תתקבל הודעה על שינויים מהותיים ברשימת ספקי המשנה לפחות 30 יום מראש.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">יצירת קשר</h2>
        <p className="text-gray-700 leading-relaxed">
          לשאלות בנוגע לספקי משנה ועיבוד נתונים:{' '}
          <a href={`mailto:${LEGAL.privacyContactEmail}`} className="text-orange-600 hover:underline">
            {LEGAL.privacyContactEmail}
          </a>
        </p>
      </section>
    </LegalPageLayout>
  );
}
