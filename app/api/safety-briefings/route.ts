import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { addYears, parseISO } from 'date-fns';

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const body = await request.json();
  const { worker_id, mode, language, conducted_by, signature_url, file_url, briefed_at } = body;

  if (!worker_id || !mode || !briefed_at) {
    return NextResponse.json({ error: 'שדות חסרים: worker_id, mode, briefed_at' }, { status: 400 });
  }

  const validModes = ['system', 'external'];
  if (!validModes.includes(mode)) {
    return NextResponse.json({ error: 'mode לא תקין' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify worker belongs to this company
  const { data: worker } = await supabase
    .from('workers')
    .select('id')
    .eq('id', worker_id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 });

  const briefedDate = parseISO(briefed_at);
  const expiresAt = addYears(briefedDate, 1).toISOString().split('T')[0];

  const { data, error: dbError } = await supabase
    .from('safety_briefings')
    .insert({
      worker_id,
      mode,
      language: language ?? null,
      conducted_by: conducted_by?.trim() || null,
      signature_url: signature_url ?? null,
      file_url: file_url ?? null,
      briefed_at,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const { briefing_id } = await request.json();
  if (!briefing_id) return NextResponse.json({ error: 'briefing_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify the briefing's worker belongs to this company
  const { data: briefing } = await supabase
    .from('safety_briefings')
    .select('worker_id')
    .eq('id', briefing_id)
    .single();

  if (!briefing) return NextResponse.json({ error: 'תדריך לא נמצא' }, { status: 404 });

  const { data: worker } = await supabase
    .from('workers')
    .select('id')
    .eq('id', briefing.worker_id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!worker) return NextResponse.json({ error: 'תדריך לא נמצא' }, { status: 404 });

  const { error: dbError } = await supabase.from('safety_briefings').delete().eq('id', briefing_id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
