import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';

export async function GET() {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('manager_user_mappings')
    .select(`
      id, company_id, manager_worker_id, user_id, created_at,
      worker:manager_worker_id(id, full_name, photo_url),
      profile:user_id(id, full_name, email, username)
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId, userId } = context;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'body נדרש' }, { status: 400 });

  const { manager_worker_id, user_id } = body as Record<string, string>;
  if (!manager_worker_id?.trim()) return NextResponse.json({ error: 'manager_worker_id נדרש' }, { status: 400 });
  if (!user_id?.trim())           return NextResponse.json({ error: 'user_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify the worker belongs to this company and is a site manager
  const { data: worker } = await supabase
    .from('workers')
    .select('id, is_responsible_site_manager')
    .eq('id', manager_worker_id)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'מנהל אתר לא נמצא' }, { status: 404 });
  if (!worker.is_responsible_site_manager) {
    return NextResponse.json({ error: 'העובד אינו מוגדר כמנהל אתר' }, { status: 422 });
  }

  // Verify the user belongs to this company
  const { data: membership } = await supabase
    .from('company_members')
    .select('user_id, is_active')
    .eq('company_id', companyId)
    .eq('user_id', user_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: 'משתמש אינו חבר פעיל בחברה' }, { status: 422 });

  const { data, error: insertError } = await supabase
    .from('manager_user_mappings')
    .insert({ company_id: companyId, manager_worker_id, user_id, created_by: userId })
    .select(`
      id, company_id, manager_worker_id, user_id, created_at,
      worker:manager_worker_id(id, full_name, photo_url),
      profile:user_id(id, full_name, email, username)
    `)
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'שיוך זה כבר קיים' }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
