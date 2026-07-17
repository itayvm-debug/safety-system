import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';
import { SYSTEM_VERSION } from '@/lib/system/version';

export const metadata: Metadata = { title: `אודות — ${LEGAL.productName}` };

export default function AboutPage() {
  const isDraft = !LEGAL.legallyReviewed;
  const env = process.env.NODE_ENV ?? 'unknown';

  return (
    <LegalPageLayout
      title={`אודות ${LEGAL.productName}`}
      prevPage={{ href: '/accessibility', label: 'הצהרת נגישות' }}
    >

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">מהי המערכת</h2>
        <p className="text-gray-700 leading-relaxed">
          SafeDoc היא מערכת ניהול מסמכי בטיחות לעובדים באתרי בנייה, שפותחה עבור {LEGAL.companyName}.
          המערכת מאפשרת ניהול מסמכים ותעודות, מעקב תוקף, ניהול עובדים, ציוד הרמה, רכבים וצמ&rdquo;ה —
          הכל במקום אחד, עם ממשק מותאם לשפה העברית וכיווניות RTL.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">פרטי החברה</h2>
        <dl className="space-y-2 text-gray-700">
          <div>
            <dt className="font-medium text-gray-900">שם החברה</dt>
            <dd>{LEGAL.companyName}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">שם באנגלית</dt>
            <dd>{LEGAL.companyNameEn}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">מספר ח.פ.</dt>
            <dd>{LEGAL.companyRegistration}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">כתובת</dt>
            <dd>{LEGAL.companyAddress}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">טלפון</dt>
            <dd>
              <a href={`tel:${LEGAL.companyPhone}`} className="text-orange-600 hover:underline">
                {LEGAL.companyPhone}
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">אימייל</dt>
            <dd>
              <a href={`mailto:${LEGAL.companyEmail}`} className="text-orange-600 hover:underline">
                {LEGAL.companyEmail}
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">גרסאות מערכת ומסמכים</h2>
        <dl className="space-y-2 text-gray-700">
          <div>
            <dt className="font-medium text-gray-900">גרסת מערכת</dt>
            <dd className="font-mono text-sm">v{SYSTEM_VERSION}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">גרסת תנאי שימוש</dt>
            <dd className="font-mono text-sm">{LEGAL.termsVersion}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">גרסת מדיניות פרטיות</dt>
            <dd className="font-mono text-sm">{LEGAL.privacyVersion}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">גרסת הצהרת נגישות</dt>
            <dd className="font-mono text-sm">{LEGAL.accessibilityVersion}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">תאריך תחולת מסמכים</dt>
            <dd>{LEGAL.termsEffectiveDate}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">סביבה</dt>
            <dd className="font-mono text-sm">{env}</dd>
          </div>
          {isDraft && (
            <div>
              <dt className="font-medium text-gray-900">סטטוס משפטי</dt>
              <dd className="text-amber-700 font-medium">טיוטה — טרם עבר סקירת עורך דין</dd>
            </div>
          )}
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">קישורים מהירים</h2>
        <ul className="space-y-2 text-gray-700">
          <li><a href="/terms" className="text-orange-600 hover:underline">תנאי שימוש</a></li>
          <li><a href="/privacy" className="text-orange-600 hover:underline">מדיניות פרטיות</a></li>
          <li><a href="/accessibility" className="text-orange-600 hover:underline">הצהרת נגישות</a></li>
          <li><a href="/subprocessors" className="text-orange-600 hover:underline">ספקי משנה</a></li>
          <li><a href="/data-retention" className="text-orange-600 hover:underline">מדיניות שמירת מידע</a></li>
        </ul>
      </section>

    </LegalPageLayout>
  );
}
