import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id: companyId } = await params;
  const supabase = createServiceClient();

  const { data, error: dbError } = await supabase
    .from('company_members')
    .select('id, company_id, user_id, role, is_active, joined_at, profile:user_id(full_name, email, username, role)')
    .eq('company_id', companyId)
    .order('joined_at', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id: companyId } = await params;

  try {
    const body = await request.json();
    const { user_id, role } = body;

    if (!user_id?.trim()) {
      return NextResponse.json({ error: 'שדה חובה חסר: user_id' }, { status: 400 });
    }

    if (!['owner', 'admin', 'member'].includes(role)) {
      return NextResponse.json({ error: 'role לא חוקי — חייב להיות owner, admin או member' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Verify company exists and is active
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('is_active', true)
      .maybeSingle();

    if (!company) {
      return NextResponse.json({ error: 'חברה לא נמצאה' }, { status: 404 });
    }

    // Verify user exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });
    }

    // Check for existing active membership
    const { data: existing } = await supabase
      .from('company_members')
      .select('id, is_active')
      .eq('company_id', companyId)
      .eq('user_id', user_id)
      .maybeSingle();

    if (existing?.is_active) {
      return NextResponse.json({ error: 'המשתמש כבר חבר פעיל בחברה' }, { status: 409 });
    }

    let memberData;

    if (existing) {
      // Reactivate existing membership
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
        .insert({ company_id: companyId, user_id, role, is_active: true })
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
