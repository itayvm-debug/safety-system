import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('lifting_machine_appointments')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createServiceClient();

  // מחיקת קבצים מ-Storage
  const { data: appt } = await supabase
    .from('lifting_machine_appointments')
    .select('operator_signature_url, appointer_signature_url, pdf_url')
    .eq('id', id)
    .single();

  if (appt) {
    const toDelete = [appt.operator_signature_url, appt.appointer_signature_url, appt.pdf_url]
      .filter(Boolean) as string[];
    if (toDelete.length) {
      await supabase.storage.from('worker-files').remove(toDelete);
    }
  }

  const { error } = await supabase.from('lifting_machine_appointments').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
