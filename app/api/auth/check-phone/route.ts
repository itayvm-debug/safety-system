import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeIsraeliPhone, phoneVariants } from '@/lib/phone';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone } = body;

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ error: 'מספר טלפון נדרש' }, { status: 400 });
    }

    const normalized = normalizeIsraeliPhone(phone);
    const variants = phoneVariants(phone); // [+972..., 05...]

    console.log('[check-phone] התקבל:', phone, '→ מנורמל:', normalized, '| גרסאות:', variants);

    const supabase = createServiceClient();

    // שאילתה לפי כל הפורמטים האפשריים (תמיכה בנתונים ישנים)
    const { data, error } = await supabase
      .from('authorized_phones')
      .select('id, phone')
      .in('phone', variants)
      .limit(1)
      .single();

    if (error) {
      console.log('[check-phone] שגיאת DB:', error.code, '—', error.message);
    }
    console.log('[check-phone] תוצאה:', data ? `נמצא (${data.phone})` : 'לא נמצא');

    if (error || !data) {
      return NextResponse.json(
        { authorized: false, error: 'מספר הטלפון אינו מורשה למערכת' },
        { status: 403 }
      );
    }

    return NextResponse.json({ authorized: true });
  } catch (e) {
    console.error('[check-phone] שגיאת שרת:', e);
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
