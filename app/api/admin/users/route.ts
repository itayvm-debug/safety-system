import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('profiles')
    .select('id, full_name, username, email, report_email, role, job_title, is_active, created_at')
    .order('created_at', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const { full_name, username, email, password, role, job_title, company_id } = body;

    if (!full_name?.trim() || !username?.trim() || !password || !role) {
      return NextResponse.json({ error: 'שדות חובה חסרים: שם מלא, שם משתמש, סיסמה, הרשאה' }, { status: 400 });
    }

    if (!['admin', 'user'].includes(role)) {
      return NextResponse.json({ error: 'הרשאה לא חוקית' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' }, { status: 400 });
    }

    if (!company_id?.trim()) {
      return NextResponse.json({ error: 'שדה חובה חסר: company_id' }, { status: 400 });
    }

    const normalizedUsername = username.toLowerCase().trim();
    const userEmail = email?.trim() || `${normalizedUsername}@safedoc.local`;

    const supabase = createServiceClient();

    // Validate company_id server-side — never trust it from the client directly
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', company_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!company) {
      return NextResponse.json({ error: 'חברה לא נמצאה' }, { status: 400 });
    }

    // יצירת auth user — email_confirm=true מדלג על אישור מייל
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: userEmail,
      password,
      email_confirm: true,
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        return NextResponse.json({ error: 'כתובת המייל כבר בשימוש' }, { status: 409 });
      }
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // יצירת profile — אם נכשל, מחק את ה-auth user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        full_name: full_name.trim(),
        username: normalizedUsername,
        email: userEmail,
        role,
        job_title: job_title?.trim() || null,
        is_active: true,
      })
      .select()
      .single();

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      if (profileError.message.includes('unique') || profileError.message.includes('duplicate')) {
        return NextResponse.json({ error: 'שם המשתמש כבר קיים במערכת' }, { status: 409 });
      }
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // Create company membership — map platform role to company role
    const companyRole = role === 'admin' ? 'admin' : 'member';
    const { error: memberError } = await supabase
      .from('company_members')
      .insert({
        company_id: company.id,
        user_id: authData.user.id,
        role: companyRole,
        is_active: true,
      });

    if (memberError) {
      // Compensating cleanup: remove profile + auth user so the operation is atomic
      await supabase.from('profiles').delete().eq('id', authData.user.id);
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: 'שגיאה ביצירת חברות בחברה' }, { status: 500 });
    }

    return NextResponse.json(profile, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
