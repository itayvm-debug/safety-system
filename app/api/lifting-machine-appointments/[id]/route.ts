import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdmin, getCurrentCompanyContext } from '@/lib/auth/company-context';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('lifting_machine_appointments')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (dbError || !data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { context, error } = await requireCompanyAdmin();
  if (error) return error;
  const { companyId } = context;

  const { id } = await params;
  const supabase = createServiceClient();

  // Ownership check
  const { data: appt } = await supabase
    .from('lifting_machine_appointments')
    .select('company_id, operator_signature_url, appointer_signature_url, pdf_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!appt) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const toDelete = [appt.operator_signature_url, appt.appointer_signature_url, appt.pdf_url]
    .filter(Boolean) as string[];
  if (toDelete.length) {
    await supabase.storage.from('worker-files').remove(toDelete);
  }

  const { error: dbError } = await supabase
    .from('lifting_machine_appointments')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
