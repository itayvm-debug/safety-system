import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/api';
import { buildAllIssues } from '@/lib/documents/issues';
import type { Issue } from '@/lib/documents/issues';

const SEVERITY: Record<Issue['status'], number> = {
  expired: 3,
  missing: 2,
  expiring_soon: 1,
};

export async function GET() {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

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
      .select('*, subcontractor:subcontractors(id, name)')
      .eq('is_active', true)
      .order('description'),
    supabase
      .from('lifting_equipment')
      .select('*, subcontractor:subcontractors(id, name)')
      .eq('is_active', true)
      .order('description'),
  ]);

  if (workersRes.error || vehiclesRes.error || heavyRes.error || liftingRes.error) {
    return NextResponse.json({ error: 'שגיאה בטעינת נתונים' }, { status: 500 });
  }

  const issues = buildAllIssues(
    workersRes.data ?? [],
    vehiclesRes.data ?? [],
    heavyRes.data ?? [],
    liftingRes.data ?? [],
  );

  const sorted = issues.sort((a, b) => (SEVERITY[b.status] ?? 0) - (SEVERITY[a.status] ?? 0));

  return NextResponse.json(sorted);
}
