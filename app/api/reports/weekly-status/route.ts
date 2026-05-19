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

async function runReport(testRecipient?: string): Promise<{ sent: number; recipients: string[]; issues: number }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.REPORT_FROM_EMAIL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (!apiKey) throw new Error('RESEND_API_KEY לא מוגדר');
  if (!fromEmail) throw new Error('REPORT_FROM_EMAIL לא מוגדר');

  const { workers, vehicles, heavyEquipment, liftingEquipment } = await fetchAllData();
  const issues = buildAllIssues(workers, vehicles, heavyEquipment, liftingEquipment);
  const html = buildWeeklyReportHtml(issues, appUrl);

  const recipients = testRecipient
    ? [testRecipient]
    : (await fetchAdminRecipients()).map((r) => r.report_email);

  if (recipients.length === 0) {
    return { sent: 0, recipients: [], issues: issues.length };
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: `SafeDoc <${fromEmail}>`,
    to: recipients,
    subject: `דוח סטטוס שבועי SafeDoc — ${new Date().toLocaleDateString('he-IL')}`,
    html,
  });

  return { sent: recipients.length, recipients, issues: issues.length };
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
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'שגיאה לא ידועה';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── POST — שליחת דוח ידני ע"י אדמין מחובר ───────────────────────
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  // אדמין יכול לציין מייל מסוים לדוח בדיקה, או לשלוח לכולם
  let testRecipient: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.test_email) testRecipient = String(body.test_email);
  } catch {
    // no body — fine
  }

  try {
    const result = await runReport(testRecipient);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'שגיאה לא ידועה';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
