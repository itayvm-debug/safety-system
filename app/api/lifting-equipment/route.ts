import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';

export async function GET() {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('lifting_equipment')
    .select('*, subcontractor:subcontractors(id, name)')
    .eq('company_id', companyId)
    .eq('is_archived', false)
    .order('description');

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const body = await request.json();
  const { description, subcontractor_id, project_name } = body;

  if (!description?.trim()) return NextResponse.json({ error: 'תיאור נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  if (subcontractor_id) {
    const { data: sub } = await supabase
      .from('subcontractors')
      .select('id')
      .eq('id', subcontractor_id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!sub) return NextResponse.json({ error: 'קבלן לא נמצא' }, { status: 404 });
  }

  const { data, error: dbError } = await supabase
    .from('lifting_equipment')
    .insert({
      company_id: companyId,
      description: description.trim(),
      subcontractor_id: subcontractor_id || null,
      project_name: project_name?.trim() || null,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
