import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { validateFileFields, cleanupAfterChange, replacedPaths } from '@/lib/storage/file-paths';

export async function GET(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
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
  const { context, error } = await requireCompanyAdminRole();
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

  // The upsert replaces the current (equipment, insurance_type) row — its file counts as "unchanged"
  const { data: current } = await supabase
    .from('heavy_equipment_insurances')
    .select('file_url')
    .eq('heavy_equipment_id', heavy_equipment_id)
    .eq('insurance_type', insurance_type.trim())
    .eq('company_id', context.companyId)
    .maybeSingle();
  const before = { file_url: (current?.file_url ?? null) as string | null };

  // P1·1 — the client may only attach a file issued to / owned by this company
  const fileCheck = await validateFileFields(supabase, context.companyId, { file_url }, before);
  if (!fileCheck.ok) return fileCheck.error;
  const newFileUrl = fileCheck.values.file_url ?? null;

  const { data, error: dbError } = await supabase
    .from('heavy_equipment_insurances')
    .upsert(
      {
        heavy_equipment_id,
        company_id: context.companyId,
        insurance_type: insurance_type.trim(),
        file_url: newFileUrl,
        expiry_date: expiry_date || null,
      },
      { onConflict: 'heavy_equipment_id,insurance_type' }
    )
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // P1·6 — retention gate: the file is kept until a retention policy is decided (AUTO_REMOVE_ON)
  await cleanupAfterChange('file_replaced', supabase, replacedPaths(before, { file_url: newFileUrl }));
  return NextResponse.json(data, { status: 200 });
}
