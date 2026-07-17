import { Metadata } from 'next';
import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { LEGAL } from '@/lib/legal/config';

export const metadata: Metadata = { title: `תנאי שימוש — ${LEGAL.productName}` };

const toc = [
  { id: 'general',         label: 'כללי ועדכון תנאים' },
  { id: 'access',          label: 'גישה למערכת ואבטחת חשבון' },
  { id: 'purpose',         label: 'מטרת המערכת וייעודה' },
  { id: 'restrictions',    label: 'שימוש אסור' },
  { id: 'data',            label: 'מידע אישי ואחריות המשתמש' },
  { id: 'ip',              label: 'קניין רוחני' },
  { id: 'availability',    label: 'זמינות המערכת' },
  { id: 'liability',       label: 'הגבלת אחריות' },
  { id: 'termination',     label: 'ביטול גישה' },
  { id: 'governing-law',   label: 'דין חל וסמכות שיפוט' },
  { id: 'contact',         label: 'יצירת קשר' },
];

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="תנאי שימוש"
      version={LEGAL.termsVersion}
      effectiveDate={LEGAL.termsEffectiveDate}
      summary={`מסמך זה מגדיר את תנאי השימוש במערכת SafeDoc המופעלת על ידי ${LEGAL.companyName}. גישה למערכת מותנית בהסכמה לתנאים אלה. השימוש מוגבל לגורמים מורשים לצורך ניהול מסמכי בטיחות עובדים.`}
      toc={toc}
      nextPage={{ href: '/privacy', label: 'מדיניות פרטיות' }}
    >

      {/* 1 */}
      <section id="general">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. כללי ועדכון תנאים</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          מערכת SafeDoc (&ldquo;המערכת&rdquo;) מופעלת על ידי {LEGAL.companyName} (&ldquo;החברה&rdquo;).
          גישה למערכת ושימוש בה מהווים הסכמה מלאה לתנאים המפורטים במסמך זה בגרסתו העדכנית.
        </p>
        <p className="text-gray-700 leading-relaxed mb-3">
          החברה שומרת לעצמה את הזכות לשנות תנאים אלה בכל עת. שינויים מהותיים יוצגו למשתמשים
          ויידרש אישור מחדש לפני המשך השימוש. המשך שימוש לאחר הצגת שינויים ייחשב כהסכמה לתנאים המעודכנים.
          גרסה נוכחית: <strong>{LEGAL.termsVersion}</strong>, תאריך תחולה: {LEGAL.termsEffectiveDate}.
        </p>
        <p className="text-gray-700 leading-relaxed">
          במקרה של סתירה בין תנאים אלה לבין הסכם כתוב אחר שנחתם בין המשתמש לחברה, יגבר ההסכם הכתוב.
        </p>
      </section>

      {/* 2 */}
      <section id="access">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. גישה למערכת ואבטחת חשבון</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          הגישה למערכת מותרת בלעדית לבעלי הרשאה מוקדמת ומפורשת מאת החברה. הרשאת גישה היא אישית
          ואינה ניתנת להעברה לצד שלישי כלשהו. החברה מנהלת את רשימת המורשים ורשאית להוסיף, לשנות
          או לבטל הרשאות לפי שיקול דעתה.
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>כל משתמש אחראי לשמירה על סודיות פרטי הכניסה שלו.</li>
          <li>יש לדווח לחברה מיידית על כל חשד לשימוש לא מורשה בחשבון.</li>
          <li>החברה שומרת לוגים של פעולות משתמשים (audit trail) לצורכי אבטחה וציות.</li>
          <li>חשבונות שלא נעשה בהם שימוש פעיל עשויים להיות מושבתים לאחר תקופה ממושכת.</li>
        </ul>
      </section>

      {/* 3 */}
      <section id="purpose">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. מטרת המערכת וייעודה</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          המערכת מיועדת לשימוש פנימי בלבד של {LEGAL.companyName} ועובדיה המורשים לצורך:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>ניהול מסמכי זהות ובטיחות של עובדים באתרי בנייה.</li>
          <li>מעקב תוקף מסמכים (רישיונות, אשרות עבודה, היתרי עבודה בגובה).</li>
          <li>ניהול ציוד הרמה, רכבים וצמ&rdquo;ה.</li>
          <li>הפקת דוחות בטיחות לשימוש פנימי.</li>
          <li>עמידה בדרישות חוקי הבטיחות בעבודה החלים.</li>
        </ul>
        <p className="text-gray-700 leading-relaxed mt-3">
          <strong>אין להשתמש במערכת לכל מטרה מסחרית, שיווקית, או אחרת שאינה מפורטת לעיל.</strong>
          המערכת אינה מיועדת לאחסון מידע שאינו קשור ישירות לניהול בטיחות וכוח אדם.
        </p>
      </section>

      {/* 4 */}
      <section id="restrictions">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. שימוש אסור</h2>
        <p className="text-gray-700 leading-relaxed mb-3">המשתמש מתחייב שלא לבצע את הפעולות הבאות:</p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>הכנסת מידע כוזב, מזויף, מטעה או שאינו מדויק למערכת.</li>
          <li>ניסיון לגשת לנתונים של גורמים שאינם בגדר הרשאתו.</li>
          <li>עקיפה או ניסיון לעקוף מנגנוני אבטחה או הרשאות.</li>
          <li>שימוש בכלים אוטומטיים (bots, scrapers, automated tools) ללא אישור כתוב מהחברה.</li>
          <li>העתקה, שכפול, הפצה, מכירה או מסירה של כל חלק מהמערכת לצד שלישי.</li>
          <li>ביצוע הנדסה לאחור (reverse engineering) של כל חלק מהמערכת.</li>
          <li>הכנסת קוד זדוני, וירוסים, או תוכן שעלול להזיק למערכת או למשתמשיה.</li>
          <li>שימוש במערכת לצרכים פרטיים שאינם קשורים לתפקידו של המשתמש בחברה.</li>
        </ul>
        <p className="text-gray-700 leading-relaxed mt-3">
          הפרת איסורים אלה עשויה להוביל לביטול הרשאה מיידי ולנקיטת הליכים משפטיים.
        </p>
      </section>

      {/* 5 */}
      <section id="data">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. מידע אישי ואחריות המשתמש</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          המשתמש המזין מידע אישי של עובדים למערכת אחראי על:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed mb-3">
          <li>
            השגת הסכמה חוקית של העובד לאיסוף ועיבוד המידע האישי שלו, לרבות תמונה ומסמכי זהות,
            בהתאם לחוק הגנת הפרטיות, התשמ&rdquo;א-1981.
          </li>
          <li>דיוק ועדכניות הנתונים המוזנים.</li>
          <li>הגבלת הגישה למידע לגורמים המורשים בלבד.</li>
          <li>ציות לכל חוק ורגולציה רלוונטיים בנוגע לעיבוד מידע אישי.</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          עיבוד מידע אישי במערכת מתבצע בהתאם ל
          <a href="/privacy" className="text-orange-600 hover:underline">מדיניות הפרטיות</a>{' '}
          המלאה. לפרטים נוספים על מידע הנאסף, ראה
          {' '}<a href="/data-retention" className="text-orange-600 hover:underline">מדיניות שמירת מידע</a>.
        </p>
      </section>

      {/* 6 */}
      <section id="ip">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">6. קניין רוחני</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          כל הזכויות במערכת SafeDoc — לרבות הקוד, העיצוב, הממשק, הלוגו, ומבנה הנתונים —
          שמורות ל-{LEGAL.companyName}. זכויות אלו מוגנות בחוק זכות יוצרים, התשס&rdquo;ח-2007
          ובדינים בינלאומיים רלוונטיים.
        </p>
        <p className="text-gray-700 leading-relaxed">
          אין להעתיק, לשכפל, לשנות, לתרגם, להפיץ, לשדר, להציג בפומבי, או ליצור יצירות נגזרות
          מכל חלק של המערכת ללא אישור מפורש מראש ובכתב מהחברה.
        </p>
      </section>

      {/* 7 */}
      <section id="availability">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">7. זמינות המערכת</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          החברה שואפת לשמור על זמינות גבוהה של המערכת אך אינה מתחייבת לזמינות רציפה ומלאה.
          המערכת עשויה להיות לא זמינה מעת לעת בשל:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed">
          <li>תחזוקה מתוכננת (תינתן הודעה מוקדמת במידת האפשר).</li>
          <li>כשלים טכניים אצל ספקי תשתית (Supabase, Vercel).</li>
          <li>עדכוני גרסה ושיפורי מערכת.</li>
          <li>אירועי אבטחה המחייבים השבתה זמנית.</li>
        </ul>
        <p className="text-gray-700 leading-relaxed mt-3">
          המערכת מסופקת &ldquo;כפי שהיא&rdquo; (AS IS) ו&ldquo;כפי שזמינה&rdquo; (AS AVAILABLE).
          {/* [החלטה נדרשת לפני מסחור]: הגדרת SLA רשמי עם ערכי זמינות מדידים */}
        </p>
      </section>

      {/* 8 */}
      <section id="liability">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">8. הגבלת אחריות</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          במידה המרבית המותרת על פי הדין החל:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed mb-3">
          <li>
            החברה לא תישא באחריות לנזקים עקיפים, תוצאתיים, מקריים, או עונשיים הנובעים מהשימוש
            או אי-השימוש במערכת.
          </li>
          <li>
            האחריות על דיוק הנתונים המוזנים למערכת מוטלת על המשתמש המזין. החברה אינה אחראית
            לתוצאות שגיאות נתונים שהוזנו על ידי משתמשים.
          </li>
          <li>
            החברה אינה אחראית לתוצאות של תקלות טכניות, השבתות, או אובדן נתונים שאינם בשליטתה.
          </li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          הגבלות אלו חלות גם על נזקים שהחברה נחשפה לאפשרותם.
          {/* [החלטה נדרשת לפני מסחור]: קביעת תקרת אחריות כספית */}
        </p>
      </section>

      {/* 9 */}
      <section id="termination">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">9. ביטול גישה</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          החברה רשאית לבטל או להשעות את גישת המשתמש בכל עת ומכל סיבה, לרבות:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1.5 leading-relaxed mb-3">
          <li>הפרת תנאי שימוש אלה.</li>
          <li>סיום יחסי ההעסקה בין המשתמש לחברה.</li>
          <li>חשד לפגיעה באבטחת המערכת.</li>
          <li>שיקולים תפעוליים של החברה.</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          המשתמש רשאי לבקש ביטול גישתו בכל עת על ידי פנייה ל-{LEGAL.companyEmail}.
          עם ביטול הגישה, תנאים אלה ממשיכים לחול ביחס לכל שימוש שנעשה בעבר.
        </p>
      </section>

      {/* 10 */}
      <section id="governing-law">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">10. דין חל וסמכות שיפוט</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          תנאים אלה כפופים לדיני מדינת ישראל, ללא תחולת כללי ברירת הדין.
          כל מחלוקת הנובעת מהם תידון בבתי המשפט המוסמכים במחוז הדרום, ישראל,
          ולהם תהא סמכות שיפוט בינלאומית ומקומית ייחודית.
        </p>
        <p className="text-gray-700 leading-relaxed">
          הצדדים יעשו מאמץ לפתור מחלוקות בדרכי שלום לפני פנייה לבית המשפט.
        </p>
      </section>

      {/* 11 */}
      <section id="contact">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">11. יצירת קשר</h2>
        <p className="text-gray-700 leading-relaxed">
          לשאלות, הסתייגויות, או בקשות בנוגע לתנאי השימוש, ניתן לפנות אל:
        </p>
        <address className="not-italic text-gray-700 mt-2 space-y-1">
          <p><strong>{LEGAL.companyName}</strong></p>
          <p>{LEGAL.companyAddress}</p>
          <p>
            אימייל:{' '}
            <a href={`mailto:${LEGAL.companyEmail}`} className="text-orange-600 hover:underline">
              {LEGAL.companyEmail}
            </a>
          </p>
          <p>
            טלפון:{' '}
            <a href={`tel:${LEGAL.companyPhone}`} className="text-orange-600 hover:underline">
              {LEGAL.companyPhone}
            </a>
          </p>
        </address>
      </section>

    </LegalPageLayout>
  );
}
