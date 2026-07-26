import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentCompanyContext, requireCompanyAdmin } from '@/lib/auth/company-context';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('subcontractors')
    .select('*, responsible_worker:workers!subcontractors_responsible_worker_id_fkey(id, full_name)')
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  if (dbError || !data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId, username } = context;

  const body = await request.json();
  const { name, contact_name, phone, notes, responsible_worker_id } = body;

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json({ error: 'שם קבלן לא יכול להיות ריק' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify ownership before any update
  const { data: existing } = await supabase
    .from('subcontractors')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  // If setting responsible_worker_id, verify the worker belongs to this company
  if ('responsible_worker_id' in body && responsible_worker_id != null) {
    const { data: worker } = await supabase
      .from('workers')
      .select('id')
      .eq('id', responsible_worker_id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!worker) return NextResponse.json({ error: 'עובד לא נמצא בחברה זו' }, { status: 422 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (contact_name !== undefined) updates.contact_name = contact_name?.trim() || null;
  if (phone !== undefined) updates.phone = phone?.trim() || null;
  if (notes !== undefined) updates.notes = notes?.trim() || null;
  if ('responsible_worker_id' in body) updates.responsible_worker_id = responsible_worker_id ?? null;
  if ('is_archived' in body) {
    updates.is_archived = !!body.is_archived;
    updates.archived_at = body.is_archived ? new Date().toISOString() : null;
    updates.archived_by = body.is_archived ? (username ?? null) : null;
  }

  const { data, error: dbError } = await supabase
    .from('subcontractors')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select('*, responsible_worker:workers!subcontractors_responsible_worker_id_fkey(id, full_name)')
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId } = context;

  const supabase = createServiceClient();

  // Verify ownership before deleting
  const { data: existing } = await supabase
    .from('subcontractors')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const { error: dbError } = await supabase
    .from('subcontractors')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
