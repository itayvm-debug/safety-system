import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';
import { auditLog } from '@/lib/audit/log';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const { full_name, role, job_title, is_active, report_email } = body;

  if (role !== undefined && !['admin', 'user'].includes(role)) {
    return NextResponse.json({ error: 'הרשאה לא חוקית' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // ── Platform-role change guards ────────────────────────────────────────
  if (role !== undefined) {
    // Fetch the current role of the target user
    const { data: target } = await supabase
      .from('profiles')
      .select('role, email')
      .eq('id', id)
      .single();

    if (!target) {
      return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });
    }

    const isDemotion = target.role === 'admin' && role === 'user';

    if (isDemotion) {
      // Prevent removing the last active platform admin
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true);

      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: 'לא ניתן לשנות הרשאת מנהל הפלטפורמה האחרון — יש לקדם מנהל אחר תחילה' },
          { status: 409 }
        );
      }

      // Prevent self-demotion — admin must stay in the system
      if (id === session.userId) {
        return NextResponse.json(
          { error: 'לא ניתן לשנות את הרשאת הפלטפורמה של עצמך' },
          { status: 409 }
        );
      }
    }
  }

  const update: Record<string, unknown> = {};
  if (full_name !== undefined) update.full_name = String(full_name).trim();
  if (role !== undefined) update.role = role;
  if (job_title !== undefined) update.job_title = job_title?.trim() || null;
  if (is_active !== undefined) update.is_active = Boolean(is_active);
  if (report_email !== undefined) update.report_email = report_email?.trim() || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });

  // ── Audit log for platform role changes ────────────────────────────────
  if (role !== undefined) {
    const action = role === 'admin' ? 'admin.platform_role_grant' : 'admin.platform_role_revoke';
    void auditLog({
      user_id:     session.userId,
      user_email:  session.email,
      action,
      entity_type: 'profile',
      entity_id:   id,
      metadata:    { new_role: role, target_email: (data as { email?: string }).email ?? null },
      ip_address:  request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
    });
  }

  return NextResponse.json(data);
}
