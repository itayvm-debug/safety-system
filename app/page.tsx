import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import { WorkerWithDocuments, HeavyEquipment, LiftingEquipment } from '@/types';
import { getWorkerStatus, getHeavyEquipmentStatus, getLiftingEquipmentStatus } from '@/lib/documents/status';

export const dynamic = 'force-dynamic';

function countStatuses<T>(items: T[], getStatus: (item: T) => string) {
  let ok = 0, warn = 0, bad = 0;
  for (const item of items) {
    const s = getStatus(item);
    if (s === 'valid' || s === 'not_required') ok++;
    else if (s === 'expiring_soon') warn++;
    else bad++;
  }
  return { ok, warn, bad, total: items.length };
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const service = createServiceClient();

  const [workersRes, heavyRes, liftingRes] = await Promise.all([
    service.from('workers').select('*, documents(*), safety_briefings(*), height_restrictions(*)').eq('is_active', true),
    service.from('heavy_equipment').select('*').eq('is_active', true),
    service.from('lifting_equipment').select('*').eq('is_active', true),
  ]);

  const workers = (workersRes.data ?? []) as WorkerWithDocuments[];
  const heavy = (heavyRes.data ?? []) as HeavyEquipment[];
  const lifting = (liftingRes.data ?? []) as LiftingEquipment[];

  const wStats = countStatuses(workers, (w) => getWorkerStatus(w));
  const hStats = countStatuses(heavy, (e) => getHeavyEquipmentStatus(e));
  const lStats = countStatuses(lifting, (e) => getLiftingEquipmentStatus(e));

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">סקירה כללית</h1>
          <p className="text-sm text-gray-500 mt-1">מצב מסמכי הבטיחות באתר</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <DashboardCard
            title="עובדים"
            href="/workers"
            stats={wStats}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
          <DashboardCard
            title='כלי צמ"ה'
            href="/heavy-equipment"
            stats={hStats}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h8l2-2zm0 0h2a1 1 0 001-1v-3.34a1 1 0 00-.293-.707L13 8V6" />
              </svg>
            }
          />
          <DashboardCard
            title="ציוד הרמה"
            href="/lifting-equipment"
            stats={lStats}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            }
          />
        </div>
      </main>
    </div>
  );
}

function DashboardCard({
  title,
  href,
  stats,
  icon,
}: {
  title: string;
  href: string;
  stats: { ok: number; warn: number; bad: number; total: number };
  icon: React.ReactNode;
}) {
  const hasIssues = stats.bad > 0 || stats.warn > 0;

  return (
    <Link
      href={href}
      className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all group"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg ${hasIssues ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
          {icon}
        </div>
        <span className="text-2xl font-bold text-gray-900">{stats.total}</span>
      </div>
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            תקין
          </span>
          <span className="font-medium text-gray-700">{stats.ok}</span>
        </div>
        {stats.warn > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-yellow-600">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              עומד לפוג
            </span>
            <span className="font-medium text-gray-700">{stats.warn}</span>
          </div>
        )}
        {stats.bad > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              לא תקין
            </span>
            <span className="font-medium text-gray-700">{stats.bad}</span>
          </div>
        )}
      </div>
      <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400 group-hover:text-orange-500 transition-colors">
        לרשימה המלאה ←
      </div>
    </Link>
  );
}
