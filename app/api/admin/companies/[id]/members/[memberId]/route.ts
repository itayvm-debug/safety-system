import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string; memberId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id: companyId, memberId } = await params;

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if ('role' in body) {
      if (!['owner', 'admin', 'member'].includes(body.role)) {
        return NextResponse.json({ error: 'role לא חוקי' }, { status: 400 });
      }
      updates.role = body.role;
    }

    if ('is_active' in body) {
      updates.is_active = Boolean(body.is_active);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'לא נשלח שום שדה לעדכון' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data, error: patchError } = await supabase
      .from('company_members')
      .update(updates)
      .eq('id', memberId)
      .eq('company_id', companyId)
      .select()
      .single();

    if (patchError) {
      if (patchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'חבר לא נמצא' }, { status: 404 });
      }
      return NextResponse.json({ error: patchError.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id: companyId, memberId } = await params;
  const supabase = createServiceClient();

  // Verify membership belongs to this company
  const { data: membership } = await supabase
    .from('company_members')
    .select('id')
    .eq('id', memberId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'חבר לא נמצא' }, { status: 404 });
  }

  // Prevent removing last active member
  const { count } = await supabase
    .from('company_members')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_active', true);

  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'לא ניתן להסיר את החבר האחרון הפעיל בחברה' }, { status: 409 });
  }

  const { error: deleteError } = await supabase
    .from('company_members')
    .delete()
    .eq('id', memberId)
    .eq('company_id', companyId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
