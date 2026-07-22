import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';
import { SYSTEM_VERSION, SCHEMA_VERSION, BUILD_DATE } from '@/lib/system/version';

export const metadata: Metadata = { title: `אודות — ${LEGAL.productName}` };

export default function AboutPage() {
  const env = process.env.NODE_ENV ?? 'unknown';
  // BUILD_DATE is set at build time via NEXT_PUBLIC_BUILD_DATE; falls back to 'לא הוגדר'

  return (
    <LegalPageLayout
      title={`אודות ${LEGAL.productName}`}
      prevPage={{ href: '/accessibility', label: 'הצהרת נגישות' }}
    >

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">מהי המערכת</h2>
        <p className="text-gray-700 leading-relaxed">
          SafeDoc היא מערכת ניהול מסמכי בטיחות לעובדים באתרי בנייה, המופעלת על ידי {LEGAL.companyName}.
          המערכת מאפשרת ניהול מסמכים ותעודות, מעקב תוקף, ניהול עובדים, ציוד הרמה, רכבים וצמ&rdquo;ה —
          הכל במקום אחד, עם ממשק מותאם לשפה העברית וכיווניות RTL.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">פרטי המפעיל</h2>
        <dl className="space-y-2 text-gray-700">
          <div>
            <dt className="font-medium text-gray-900">מפעיל</dt>
            <dd>{LEGAL.companyName}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">טלפון</dt>
            <dd>
              <a href={`tel:${LEGAL.companyPhone}`} className="text-orange-700 underline">
                {LEGAL.companyPhone}
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">אימייל</dt>
            <dd>
              <a href={`mailto:${LEGAL.companyEmail}`} className="text-orange-700 underline">
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
            <dt className="font-medium text-gray-900">גרסת סכמת DB צפויה</dt>
            <dd className="font-mono text-sm">{SCHEMA_VERSION}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">תאריך בנייה</dt>
            <dd className="font-mono text-sm">{BUILD_DATE}</dd>
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
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">קישורים מהירים</h2>
        <ul className="space-y-2 text-gray-700">
          <li><a href="/terms" className="text-orange-700 underline">תנאי שימוש</a></li>
          <li><a href="/privacy" className="text-orange-700 underline">מדיניות פרטיות</a></li>
          <li><a href="/accessibility" className="text-orange-700 underline">הצהרת נגישות</a></li>
          <li><a href="/subprocessors" className="text-orange-700 underline">ספקי משנה</a></li>
          <li><a href="/data-retention" className="text-orange-700 underline">מדיניות שמירת מידע</a></li>
        </ul>
      </section>

    </LegalPageLayout>
  );
}
