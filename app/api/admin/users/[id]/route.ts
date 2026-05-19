import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const { full_name, role, job_title, is_active, report_email } = body;

  if (role !== undefined && !['admin', 'user'].includes(role)) {
    return NextResponse.json({ error: 'הרשאה לא חוקית' }, { status: 400 });
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

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });

  return NextResponse.json(data);
}
