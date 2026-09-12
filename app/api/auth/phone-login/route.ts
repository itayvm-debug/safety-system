import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeIsraeliPhone, phoneVariants } from '@/lib/phone';

/**
 * התחברות מבוססת authorized_phones בלבד — ללא SMS ו-OTP.
 * זורם:
 *  1. בדיקת טלפון מול authorized_phones (service role)
 *  2. יצירת/אחזור משתמש פנימי ב-Supabase Auth
 *  3. החזרת credentials ללקוח לצורך signInWithPassword
 */
export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();
    if (!phone) return NextResponse.json({ error: 'phone נדרש' }, { status: 400 });

    const normalized = normalizeIsraeliPhone(phone);
    const variants = phoneVariants(phone);

    // Log only the last 4 digits to avoid full phone numbers in server logs.
    const maskedPhone = normalized.replace(/\d(?=\d{4})/g, '*');
    console.log('[phone-login] בודק הרשאה עבור:', maskedPhone);

    const supabase = createServiceClient();

    // בדיקה מול authorized_phones
    const { data: authRow, error: authError } = await supabase
      .from('authorized_phones')
      .select('id')
      .in('phone', variants)
      .limit(1)
      .single();

    if (authError) {
      console.log('[phone-login] שגיאת DB:', authError.code, '—', authError.message);
    }

    if (!authRow) {
      console.log('[phone-login] ❌ מספר לא מורשה:', maskedPhone);
      return NextResponse.json({ error: 'מספר הטלפון אינו מורשה למערכת' }, { status: 403 });
    }

    console.log('[phone-login] ✅ מספר מורשה:', maskedPhone);

    // credentials פנימיים — נגזרים מהמספר, לא נחשפים לרשת
    const digits = normalized.replace(/\D/g, '');
    const internalEmail = `user-${digits}@safedoc.internal`;
    const internalPassword = `safedoc_${digits}_auth`;

    // וודא שהמשתמש קיים — צור אם לא
    const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = listData?.users?.find((u) => u.email === internalEmail);

    if (!existingUser) {
      const { error: createError } = await supabase.auth.admin.createUser({
        email: internalEmail,
        password: internalPassword,
        email_confirm: true,
        user_metadata: { phone: normalized },
      });
      if (createError) {
        console.error('[phone-login] שגיאה ביצירת משתמש:', createError.message);
        return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
      }
      console.log('[phone-login] משתמש חדש נוצר עבור:', maskedPhone);
    }

    return NextResponse.json({ email: internalEmail, password: internalPassword });
  } catch (e) {
    console.error('[phone-login] שגיאת שרת:', e);
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
