import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;

  try {
    const body = await request.json();
    const { full_name, username, email, password, job_title, companyRole } = body;

    if (!full_name?.trim() || !username?.trim() || !password) {
      return NextResponse.json({ error: 'שדות חובה חסרים: שם מלא, שם משתמש, סיסמה' }, { status: 400 });
    }

    if (!['owner', 'admin', 'member'].includes(companyRole ?? 'member')) {
      return NextResponse.json({ error: 'תפקיד לא חוקי — חייב להיות owner, admin או member' }, { status: 400 });
    }

    // Only an owner can create another owner
    if (companyRole === 'owner' && context.companyRole !== 'owner') {
      return NextResponse.json({ error: 'רק בעלים יכול ליצור בעלים אחר' }, { status: 403 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' }, { status: 400 });
    }

    const normalizedUsername = username.toLowerCase().trim();
    const userEmail = email?.trim() || `${normalizedUsername}@safedoc.local`;
    const resolvedCompanyRole = companyRole ?? 'member';

    const supabase = createServiceClient();

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

    // profiles.role is always 'user' — only platform admins can set 'admin'
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        full_name: full_name.trim(),
        username: normalizedUsername,
        email: userEmail,
        role: 'user',
        job_title: job_title?.trim() || null,
        is_active: true,
      })
      .select('id, full_name, username, email, role')
      .single();

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      if (profileError.message.includes('unique') || profileError.message.includes('duplicate')) {
        return NextResponse.json({ error: 'שם המשתמש כבר קיים במערכת' }, { status: 409 });
      }
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // company_id comes from trusted auth context — never from request body
    const { data: membership, error: memberError } = await supabase
      .from('company_members')
      .insert({
        company_id: context.companyId,
        user_id: authData.user.id,
        role: resolvedCompanyRole,
        is_active: true,
      })
      .select('id, company_id, user_id, role, is_active, joined_at')
      .single();

    if (memberError) {
      await supabase.from('profiles').delete().eq('id', authData.user.id);
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: 'שגיאה ביצירת חברות בחברה' }, { status: 500 });
    }

    return NextResponse.json({ ...membership, profile }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
