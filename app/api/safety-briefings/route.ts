import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { validateFileFields, cleanupAfterChange } from '@/lib/storage/file-paths';
import { readJsonObject } from '@/lib/http/json-body';

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Validates a date-only `YYYY-MM-DD` string and returns the same calendar day one year
 * later, clamped to the month's last day (Feb 29 → Feb 28). Pure calendar arithmetic —
 * no Date/timezone conversion, so the result can never shift by a day.
 * Returns null when the input is not a real calendar date.
 */
function briefingExpiryDate(briefedAt: unknown): string | null {
  if (typeof briefedAt !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(briefedAt);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;

  const nextYear = year + 1;
  const nextDay = Math.min(day, daysInMonth(nextYear, month));
  return `${nextYear}-${m[2]}-${String(nextDay).padStart(2, '0')}`;
}

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const jsonIn = await readJsonObject(request, ['conducted_by']);
  if (!jsonIn.ok) return jsonIn.error;
  const body = jsonIn.body;
  const { worker_id, mode, language, conducted_by, signature_url, file_url, briefed_at } = body;

  if (!worker_id || !mode || !briefed_at) {
    return NextResponse.json({ error: 'שדות חסרים: worker_id, mode, briefed_at' }, { status: 400 });
  }

  const validModes = ['system', 'external'];
  if (!validModes.includes(mode)) {
    return NextResponse.json({ error: 'mode לא תקין' }, { status: 400 });
  }

  // Briefing is valid for one year (calendar date, Feb 29 → Feb 28 of the next year)
  const expiresAt = briefingExpiryDate(briefed_at);
  if (!expiresAt) {
    return NextResponse.json({ error: 'תאריך התדריך אינו תקין (נדרש פורמט YYYY-MM-DD)' }, { status: 400 });
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

  // P1·1 — the client may only attach files issued to / owned by this company
  const fileCheck = await validateFileFields(supabase, companyId, { signature_url, file_url });
  if (!fileCheck.ok) return fileCheck.error;

  const { data, error: dbError } = await supabase
    .from('safety_briefings')
    .insert({
      worker_id,
      mode,
      language: language ?? null,
      conducted_by: conducted_by?.trim() || null,
      signature_url: fileCheck.values.signature_url ?? null,
      file_url: fileCheck.values.file_url ?? null,
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

  const jsonIn = await readJsonObject(request);
  if (!jsonIn.ok) return jsonIn.error;
  const { briefing_id } = jsonIn.body;
  if (!briefing_id) return NextResponse.json({ error: 'briefing_id נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // Verify the briefing's worker belongs to this company
  const { data: briefing } = await supabase
    .from('safety_briefings')
    .select('worker_id, file_url, signature_url')
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

  // P1·6 — retention gate: the file is kept until a retention policy is decided (AUTO_REMOVE_ON)
  await cleanupAfterChange('record_deleted', supabase, [briefing.file_url, briefing.signature_url]);
  return NextResponse.json({ success: true });
}
