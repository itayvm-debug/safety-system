import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';
import { SYSTEM_VERSION } from '@/lib/system/version';

export const metadata: Metadata = { title: `אודות — ${LEGAL.productName}` };

export default function AboutPage() {
  return (
    <LegalPageLayout title={`אודות ${LEGAL.productName}`}>
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">מהי המערכת</h2>
        <p className="text-gray-700 leading-relaxed">
          SafeDoc היא מערכת ניהול מסמכי בטיחות לעובדים באתרי בנייה, שפותחה עבור {LEGAL.companyName}.
          המערכת מאפשרת ניהול מסמכים, מעקב תוקף, ניהול עובדים, ציוד ורכבים — הכל במקום אחד.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">פרטי החברה</h2>
        <dl className="space-y-2 text-gray-700">
          <div>
            <dt className="font-medium">שם החברה</dt>
            <dd>{LEGAL.companyName}</dd>
          </div>
          <div>
            <dt className="font-medium">מספר עוסק / ח.פ.</dt>
            <dd>{LEGAL.companyRegistration}</dd>
          </div>
          <div>
            <dt className="font-medium">כתובת</dt>
            <dd>{LEGAL.companyAddress}</dd>
          </div>
          <div>
            <dt className="font-medium">טלפון</dt>
            <dd>{LEGAL.companyPhone}</dd>
          </div>
          <div>
            <dt className="font-medium">אימייל</dt>
            <dd>
              <a href={`mailto:${LEGAL.companyEmail}`} className="text-orange-600 hover:underline">
                {LEGAL.companyEmail}
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">פרטי גרסה</h2>
        <dl className="space-y-2 text-gray-700">
          <div>
            <dt className="font-medium">גרסת מערכת</dt>
            <dd>v{SYSTEM_VERSION}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">קישורים מהירים</h2>
        <ul className="space-y-2 text-gray-700">
          <li>
            <a href="/terms" className="text-orange-600 hover:underline">תנאי שימוש</a>
          </li>
          <li>
            <a href="/privacy" className="text-orange-600 hover:underline">מדיניות פרטיות</a>
          </li>
          <li>
            <a href="/accessibility" className="text-orange-600 hover:underline">הצהרת נגישות</a>
          </li>
          <li>
            <a href="/subprocessors" className="text-orange-600 hover:underline">ספקי משנה</a>
          </li>
          <li>
            <a href="/data-retention" className="text-orange-600 hover:underline">מדיניות שמירת מידע</a>
          </li>
        </ul>
      </section>
    </LegalPageLayout>
  );
}
