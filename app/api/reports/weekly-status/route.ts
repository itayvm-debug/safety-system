import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/api';
import { buildAllIssues } from '@/lib/documents/issues';
import { buildWeeklyReportHtml } from '@/lib/email/weekly-report';

// Shared data fetching — mirrors the alerts API select pattern.
async function fetchAllData() {
  const supabase = createServiceClient();
  const [workersRes, vehiclesRes, heavyRes, liftingRes] = await Promise.all([
    supabase
      .from('workers')
      .select(`*, documents(*), safety_briefings(*), height_restrictions(*), lifting_machine_appointments(id), professional_licenses(*), manager_licenses(*), vehicles(*, vehicle_licenses(*), vehicle_insurances(*)), subcontractor:subcontractors!workers_subcontractor_id_fkey(id, name)`)
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('vehicles')
      .select(`*, assigned_manager:workers!vehicles_assigned_manager_id_fkey(id, full_name), vehicle_licenses(*), vehicle_insurances(*)`)
      .eq('is_active', true)
      .order('vehicle_number'),
    supabase
      .from('heavy_equipment')
      .select('*, subcontractor:subcontractors(id, name), heavy_equipment_insurances(*)')
      .eq('is_active', true)
      .order('description'),
    supabase
      .from('lifting_equipment')
      .select('*, subcontractor:subcontractors(id, name)')
      .eq('is_active', true)
      .order('description'),
  ]);

  if (workersRes.error || vehiclesRes.error || heavyRes.error || liftingRes.error) {
    throw new Error('שגיאה בטעינת נתונים מה-DB');
  }

  return {
    workers: workersRes.data ?? [],
    vehicles: vehiclesRes.data ?? [],
    heavyEquipment: heavyRes.data ?? [],
    liftingEquipment: liftingRes.data ?? [],
  };
}

async function fetchAdminRecipients(): Promise<{ id: string; full_name: string; report_email: string }[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, report_email')
    .eq('role', 'admin')
    .eq('is_active', true)
    .not('report_email', 'is', null)
    .neq('report_email', '');

  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; full_name: string; report_email: string }[];
}

interface ReportResult {
  sent_count: number;
  failed_count: number;
  recipients: string[];
  issues_count: number;
  resend_id: string | null;
  errors: string[];
}

async function runReport(testRecipient?: string): Promise<ReportResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.REPORT_FROM_EMAIL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (!apiKey) throw new Error('RESEND_API_KEY לא מוגדר ב-environment variables');
  if (!fromEmail) throw new Error('REPORT_FROM_EMAIL לא מוגדר ב-environment variables');

  const { workers, vehicles, heavyEquipment, liftingEquipment } = await fetchAllData();
  const issues = buildAllIssues(workers, vehicles, heavyEquipment, liftingEquipment);
  const html = buildWeeklyReportHtml(issues, appUrl);

  const recipients = testRecipient
    ? [testRecipient]
    : (await fetchAdminRecipients()).map((r) => r.report_email);

  console.log('[weekly-report] recipients:', recipients);
  console.log('[weekly-report] issues_count:', issues.length);
  console.log('[weekly-report] from:', fromEmail);

  if (recipients.length === 0) {
    console.log('[weekly-report] no recipients — skipping send');
    return { sent_count: 0, failed_count: 0, recipients: [], issues_count: issues.length, resend_id: null, errors: [] };
  }

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from: `SafeDoc <${fromEmail}>`,
    to: recipients,
    subject: `דוח סטטוס שבועי SafeDoc — ${new Date().toLocaleDateString('he-IL')}`,
    html,
  });

  console.log('[weekly-report] resend response:', JSON.stringify({ data, error }));

  if (error) {
    const errorMessage = typeof error === 'object' && error !== null
      ? ((error as Record<string, unknown>).message as string ?? JSON.stringify(error))
      : String(error);
    console.error('[weekly-report] resend error:', errorMessage);
    return {
      sent_count: 0,
      failed_count: recipients.length,
      recipients,
      issues_count: issues.length,
      resend_id: null,
      errors: [errorMessage],
    };
  }

  const resendId = data?.id ?? null;
  console.log('[weekly-report] resend success, id:', resendId);

  return {
    sent_count: recipients.length,
    failed_count: 0,
    recipients,
    issues_count: issues.length,
    resend_id: resendId,
    errors: [],
  };
}

// ─── GET — Vercel Cron (protected by CRON_SECRET) ─────────────────
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runReport();
    const ok = result.failed_count === 0;
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'שגיאה לא ידועה';
    console.error('[weekly-report] fatal error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── POST — שליחת דוח ידני ע"י אדמין מחובר ───────────────────────
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  let testRecipient: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.test_email) testRecipient = String(body.test_email).trim();
  } catch {
    // no body — fine
  }

  try {
    const result = await runReport(testRecipient);
    const ok = result.failed_count === 0 && result.sent_count > 0;
    return NextResponse.json({ ok, ...result }, { status: result.errors.length > 0 ? 500 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'שגיאה לא ידועה';
    console.error('[weekly-report] fatal error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
