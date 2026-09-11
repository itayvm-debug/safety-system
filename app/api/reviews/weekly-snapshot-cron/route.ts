/**
 * GET /api/reviews/weekly-snapshot-cron
 * Cron job: runs Sunday 06:00 UTC, creates review assignments for all
 * companies that have employeeReviews feature enabled.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getWeekStart } from '@/lib/reviews/week';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const weekStart = getWeekStart();

  // Find all active companies with employeeReviews enabled
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('id, settings')
    .eq('is_active', true);

  if (companiesError) {
    console.error('[reviews-cron] failed to fetch companies:', companiesError.message);
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  let totalCreated = 0;
  const results: { companyId: string; created: number; error?: string }[] = [];

  for (const company of companies ?? []) {
    const settings = company.settings as Record<string, unknown> | null;
    const features = settings?.features as Record<string, unknown> | null;
    if (!features?.employeeReviews) continue;

    try {
      const { data: workers, error: workersError } = await supabase
        .from('workers')
        .select('id, responsible_manager_id')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .eq('is_archived', false);

      if (workersError) throw new Error(workersError.message);
      if (!workers || workers.length === 0) {
        results.push({ companyId: company.id, created: 0 });
        continue;
      }

      const rows = workers.map(w => ({
        company_id:           company.id,
        worker_id:            w.id,
        evaluator_manager_id: w.responsible_manager_id ?? null,
        week_start:           weekStart,
        assignment_source:    w.responsible_manager_id ? 'responsible_manager' : 'snapshot',
      }));

      const { error: insertError, count } = await supabase
        .from('worker_review_assignments')
        .upsert(rows, { onConflict: 'company_id,worker_id,week_start', ignoreDuplicates: true })
        .select('id');

      if (insertError) throw new Error(insertError.message);
      const created = count ?? 0;
      totalCreated += created;
      results.push({ companyId: company.id, created });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[reviews-cron] company ${company.id} error:`, msg);
      results.push({ companyId: company.id, created: 0, error: msg });
    }
  }

  console.log(`[reviews-cron] week ${weekStart}: total assignments created = ${totalCreated}`);
  return NextResponse.json({ week_start: weekStart, totalCreated, results });
}
