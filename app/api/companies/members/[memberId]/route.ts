import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { createServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ memberId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;

  const { memberId } = await params;

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if ('role' in body) {
      if (!['admin', 'member'].includes(body.role)) {
        return NextResponse.json({ error: 'role לא חוקי — חייב להיות admin או member' }, { status: 400 });
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

    // Fetch membership and verify it belongs to own company
    const { data: membership } = await supabase
      .from('company_members')
      .select('id, user_id, role')
      .eq('id', memberId)
      .eq('company_id', context.companyId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'חבר לא נמצא' }, { status: 404 });
    }

    // Prevent changing own role/status
    if (membership.user_id === context.userId) {
      return NextResponse.json({ error: 'לא ניתן לשנות את ההרשאות של עצמך' }, { status: 409 });
    }

    // Non-owner cannot modify an owner's membership
    if (membership.role === 'owner' && context.companyRole !== 'owner') {
      return NextResponse.json({ error: 'לא ניתן לשנות הרשאות של בעלים' }, { status: 403 });
    }

    // Last-owner protection: cannot demote the only remaining owner
    if ('role' in body && membership.role === 'owner' && body.role !== 'owner') {
      const { count: ownerCount } = await supabase
        .from('company_members')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', context.companyId)
        .eq('role', 'owner')
        .eq('is_active', true);
      if ((ownerCount ?? 0) <= 1) {
        return NextResponse.json({ error: 'לא ניתן לשנות תפקיד הבעלים האחרון בחברה' }, { status: 409 });
      }
    }

    const { data: updated, error: patchError } = await supabase
      .from('company_members')
      .update(updates)
      .eq('id', memberId)
      .eq('company_id', context.companyId)
      .select()
      .single();

    if (patchError) return NextResponse.json({ error: patchError.message }, { status: 500 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;

  const { memberId } = await params;
  const supabase = createServiceClient();

  // Verify membership belongs to own company
  const { data: membership } = await supabase
    .from('company_members')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('company_id', context.companyId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'חבר לא נמצא' }, { status: 404 });
  }

  // Prevent self-removal
  if (membership.user_id === context.userId) {
    return NextResponse.json({ error: 'לא ניתן להסיר את עצמך מהחברה' }, { status: 409 });
  }

  // Non-owner cannot remove an owner
  if (membership.role === 'owner' && context.companyRole !== 'owner') {
    return NextResponse.json({ error: 'לא ניתן להסיר בעלים מהחברה' }, { status: 403 });
  }

  // Last-owner protection
  if (membership.role === 'owner') {
    const { count: ownerCount } = await supabase
      .from('company_members')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', context.companyId)
      .eq('role', 'owner')
      .eq('is_active', true);
    if ((ownerCount ?? 0) <= 1) {
      return NextResponse.json({ error: 'לא ניתן להסיר את הבעלים האחרון בחברה' }, { status: 409 });
    }
  }

  // Prevent removing last active member
  const { count } = await supabase
    .from('company_members')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', context.companyId)
    .eq('is_active', true);

  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'לא ניתן להסיר את החבר האחרון הפעיל בחברה' }, { status: 409 });
  }

  const { error: deleteError } = await supabase
    .from('company_members')
    .delete()
    .eq('id', memberId)
    .eq('company_id', context.companyId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
