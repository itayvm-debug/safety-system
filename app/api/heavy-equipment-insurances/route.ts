import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdmin } from '@/lib/auth/company-context';

export async function GET(request: NextRequest) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;

  const heavyEquipmentId = request.nextUrl.searchParams.get('heavy_equipment_id');
  if (!heavyEquipmentId) return NextResponse.json({ error: 'heavy_equipment_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify parent equipment belongs to this company
  const { data: parent } = await supabase
    .from('heavy_equipment')
    .select('id')
    .eq('id', heavyEquipmentId)
    .eq('company_id', context.companyId)
    .maybeSingle();

  if (!parent) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from('heavy_equipment_insurances')
    .select('*')
    .eq('heavy_equipment_id', heavyEquipmentId)
    .eq('company_id', context.companyId)
    .order('insurance_type');

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;

  const body = await request.json();
  const { heavy_equipment_id, insurance_type, file_url, expiry_date } = body;

  if (!heavy_equipment_id) return NextResponse.json({ error: 'heavy_equipment_id נדרש' }, { status: 400 });
  if (!insurance_type?.trim()) return NextResponse.json({ error: 'סוג ביטוח נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify parent equipment belongs to this company
  const { data: parent } = await supabase
    .from('heavy_equipment')
    .select('id')
    .eq('id', heavy_equipment_id)
    .eq('company_id', context.companyId)
    .maybeSingle();

  if (!parent) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from('heavy_equipment_insurances')
    .upsert(
      {
        heavy_equipment_id,
        company_id: context.companyId,
        insurance_type: insurance_type.trim(),
        file_url: file_url || null,
        expiry_date: expiry_date || null,
      },
      { onConflict: 'heavy_equipment_id,insurance_type' }
    )
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data, { status: 200 });
}
