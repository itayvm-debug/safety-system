import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/api';
import { addYears, parseISO } from 'date-fns';

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await request.json();
  const { worker_id, mode, language, conducted_by, signature_url, file_url, briefed_at } = body;

  if (!worker_id || !mode || !briefed_at) {
    return NextResponse.json({ error: 'שדות חסרים: worker_id, mode, briefed_at' }, { status: 400 });
  }

  const validModes = ['system', 'external'];
  if (!validModes.includes(mode)) {
    return NextResponse.json({ error: 'mode לא תקין' }, { status: 400 });
  }

  const briefedDate = parseISO(briefed_at);
  const expiresAt = addYears(briefedDate, 1).toISOString().split('T')[0];

  const supabase = createServiceClient();
  const { data, error } = await supabase
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { briefing_id } = await request.json();
  if (!briefing_id) return NextResponse.json({ error: 'briefing_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from('safety_briefings').delete().eq('id', briefing_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
