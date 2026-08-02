import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdmin } from '@/lib/auth/company-context';

export async function GET() {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('heavy_equipment')
    .select('*, subcontractor:subcontractors(id, name), heavy_equipment_insurances(*)')
    .eq('company_id', context.companyId)
    .eq('is_archived', false)
    .order('description');

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;

  const body = await request.json();
  const { description, license_number, subcontractor_id, project_name } = body;

  if (!description?.trim()) return NextResponse.json({ error: 'תיאור נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // בדיקת כפילות על מספר רישוי — per-company (tenant-local)
  if (license_number?.trim()) {
    const { data: existing } = await supabase
      .from('heavy_equipment')
      .select('id')
      .eq('company_id', context.companyId)
      .eq('license_number', license_number.trim())
      .maybeSingle();
    if (existing) return NextResponse.json({ error: 'כלי צמ"ה עם מספר רישוי זה כבר קיים במערכת' }, { status: 409 });
  }

  const { data, error: dbError } = await supabase
    .from('heavy_equipment')
    .insert({
      company_id: context.companyId,
      description: description.trim(),
      license_number: license_number?.trim() || null,
      subcontractor_id: subcontractor_id || null,
      project_name: project_name?.trim() || null,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
