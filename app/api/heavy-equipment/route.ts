import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export async function GET() {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('heavy_equipment')
    .select('*, subcontractor:subcontractors(id, name)')
    .order('description');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await request.json();
  const { description, license_number, subcontractor_id, project_name } = body;

  if (!description?.trim()) return NextResponse.json({ error: 'תיאור נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('heavy_equipment')
    .insert({
      description: description.trim(),
      license_number: license_number?.trim() || null,
      subcontractor_id: subcontractor_id || null,
      project_name: project_name?.trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
