import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('company_members')
    .select('id, company_id, user_id, role, is_active, joined_at, profile:user_id(full_name, email, username, role)')
    .eq('company_id', context.companyId)
    .order('joined_at', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;

  try {
    const body = await request.json();
    const { email, role } = body;

    if (!email?.trim()) {
      return NextResponse.json({ error: 'שדה חובה חסר: email' }, { status: 400 });
    }

    if (!['admin', 'member'].includes(role)) {
      return NextResponse.json({ error: 'role לא חוקי — חייב להיות admin או member' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Find user by email
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .eq('is_active', true)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'משתמש עם מייל זה לא נמצא' }, { status: 404 });
    }

    // Prevent adding self (company admin adding themselves redundantly)
    if (profile.id === context.userId) {
      return NextResponse.json({ error: 'לא ניתן להוסיף את עצמך' }, { status: 409 });
    }

    // Check for existing membership
    const { data: existing } = await supabase
      .from('company_members')
      .select('id, is_active')
      .eq('company_id', context.companyId)
      .eq('user_id', profile.id)
      .maybeSingle();

    if (existing?.is_active) {
      return NextResponse.json({ error: 'המשתמש כבר חבר פעיל בחברה' }, { status: 409 });
    }

    let memberData;

    if (existing) {
      const { data, error: updateError } = await supabase
        .from('company_members')
        .update({ role, is_active: true })
        .eq('id', existing.id)
        .select()
        .single();
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      memberData = data;
    } else {
      const { data, error: insertError } = await supabase
        .from('company_members')
        .insert({ company_id: context.companyId, user_id: profile.id, role, is_active: true })
        .select()
        .single();
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      memberData = data;
    }

    return NextResponse.json(memberData, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
