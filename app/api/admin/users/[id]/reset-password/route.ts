import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';

function generatePassword(): string {
  // אותיות + מספרים ללא תווים מבלבלים (0/O, 1/l/I)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const newPassword: string = body.password?.trim() || generatePassword();

  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // וידוא שהמשתמש קיים בפרופילים
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });
  }

  // עדכון סיסמה ישירות ב-Supabase Auth — ללא שמירה בטבלה
  const { error: authError } = await supabase.auth.admin.updateUserById(id, {
    password: newPassword,
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // הסיסמה מוחזרת פעם אחת בלבד — לא נשמרת בשום מקום
  return NextResponse.json({ password: newPassword });
}
