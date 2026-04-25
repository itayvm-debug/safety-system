import React from 'react';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import Link from 'next/link';
import { WorkerWithDocuments, Vehicle, HeavyEquipment, LiftingEquipment } from '@/types';
import { buildAllIssues, countByEntity, EntityCounts } from '@/lib/documents/issues';
import { DashboardOfflineCapture } from '@/components/pwa/DashboardOfflineCapture';

export const dynamic = 'force-dynamic';

// ── אייקונים ─────────────────────────────────────────────────────────────────

function IconWorkers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconSiteManager() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M12 14c-5 0-8 2-8 4v1h16v-1c0-2-3-4-8-4z"/>
      <path d="M17 5.5 18.5 7l3-3"/>
    </svg>
  );
}
function IconVehicle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17H3a1 1 0 0 1-1-1v-4l2-5h12l2 5v4a1 1 0 0 1-1 1h-2"/>
      <circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/>
    </svg>
  );
}
function IconExcavator() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17h12"/><path d="M4 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"/>
      <path d="M14 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"/>
      <path d="M4 17V9a1 1 0 0 1 1-1h4l2-4h4l1 4h2a1 1 0 0 1 1 1v4"/><path d="M8 8v4"/>
    </svg>
  );
}
function IconLift() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 11V4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M5 11h14"/>
      <path d="M11 11v9"/><path d="M9 17h6"/><path d="M7 21h10"/>
      <path d="M8 7h2"/><path d="M14 7h2"/>
    </svg>
  );
}
function IconSubcontractors() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconFeedback() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  );
}
function IconAlert() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function IssueBadge({ counts }: { counts: EntityCounts }) {
  const { urgent, expiring } = counts;
  if (urgent === 0 && expiring === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {urgent > 0 && (
        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold leading-none">
          {urgent} לא תקין
        </span>
      )}
      {expiring > 0 && (
        <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-semibold leading-none">
          {expiring} עומד לפוג
        </span>
      )}
    </div>
  );
}

// ── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({ count, label, sublabel, href, color }: {
  count: number; label: string; sublabel?: string; href: string;
  color: 'red' | 'orange' | 'blue';
}) {
  const colors = {
    red: { bg: 'bg-red-50', border: 'border-red-200', num: 'text-red-700', text: 'text-red-600', hover: 'hover:bg-red-100' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', num: 'text-orange-700', text: 'text-orange-600', hover: 'hover:bg-orange-100' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', num: 'text-blue-700', text: 'text-blue-600', hover: 'hover:bg-blue-100' },
  }[color];

  return (
    <Link href={href} className={`${colors.bg} ${colors.border} ${colors.hover} border rounded-2xl p-5 flex flex-col gap-1 transition-colors`}>
      <span className={`text-3xl font-bold ${colors.num}`}>{count}</span>
      <span className={`text-sm font-medium ${colors.text}`}>{label}</span>
      {sublabel && <span className="text-xs text-gray-400">{sublabel}</span>}
    </Link>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function DashboardCard({
  href, icon: Icon, title, description, color, bg, border, hoverBorder, counts,
}: {
  href: string; icon: () => React.ReactElement; title: string; description: string;
  color: string; bg: string; border: string; hoverBorder: string;
  counts?: EntityCounts;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border ${border} ${hoverBorder} bg-white p-5 shadow-sm hover:shadow-md transition-all duration-200`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`${bg} ${color} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
          <Icon />
        </div>
        {counts && <IssueBadge counts={counts} />}
      </div>
      <p className="font-semibold text-gray-900 text-sm mb-1.5">{title}</p>
      <p className="text-xs text-gray-500 leading-relaxed flex-1">{description}</p>
      <div className={`flex items-center gap-1 mt-4 text-xs font-medium ${color} opacity-0 group-hover:opacity-100 transition-opacity`}>
        <span>כניסה</span>
        <IconChevron />
      </div>
    </Link>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await getSession();
  const role = session?.role ?? 'viewer';
  const isAdmin = role === 'admin';

  const supabase = createServiceClient();

  const [
    { data: workersRaw },
    { data: vehiclesRaw },
    { data: heavyRaw },
    { data: liftingRaw },
    { count: feedbackCount },
  ] = await Promise.all([
    supabase
      .from('workers')
      .select(`*, documents(id,doc_type,file_url,expiry_date,is_required), safety_briefings(id,expires_at,created_at), height_restrictions(id,expires_at,created_at), lifting_machine_appointments(id), professional_licenses(id,file_url,expiry_date,license_type), manager_licenses(id,file_url,expiry_date,license_type), vehicles(id,vehicle_number,vehicle_licenses(id,file_url,expiry_date),vehicle_insurances(id,insurance_type,file_url,expiry_date)), subcontractor:subcontractors!workers_subcontractor_id_fkey(id,name)`)
      .eq('is_active', true),
    supabase
      .from('vehicles')
      .select(`*, vehicle_licenses(id,file_url,expiry_date), vehicle_insurances(id,insurance_type,file_url,expiry_date), assigned_manager:workers!vehicles_assigned_manager_id_fkey(id,full_name)`)
      .eq('is_active', true),
    supabase
      .from('heavy_equipment')
      .select('*, subcontractor:subcontractors(id,name)')
      .eq('is_active', true),
    supabase
      .from('lifting_equipment')
      .select('*, subcontractor:subcontractors(id,name)')
      .eq('is_active', true),
    supabase
      .from('site_feedback')
      .select('*', { count: 'exact', head: true })
      .eq('is_handled', false),
  ]);

  const workers = (workersRaw ?? []) as WorkerWithDocuments[];
  const vehicles = (vehiclesRaw ?? []) as Vehicle[];
  const heavy = (heavyRaw ?? []) as HeavyEquipment[];
  const lifting = (liftingRaw ?? []) as LiftingEquipment[];

  const allIssues = buildAllIssues(workers, vehicles, heavy, lifting);

  const urgentTotal = allIssues.filter((i) => i.status === 'expired' || i.status === 'missing').length;
  const expiringTotal = allIssues.filter((i) => i.status === 'expiring_soon').length;
  const unhandledFeedback = feedbackCount ?? 0;

  const workerCounts = countByEntity(allIssues, 'worker');
  const managerCounts = countByEntity(allIssues, 'worker', true);
  const vehicleCounts = countByEntity(allIssues, 'vehicle');
  const heavyCounts = countByEntity(allIssues, 'heavy_equipment');
  const liftingCounts = countByEntity(allIssues, 'lifting_equipment');

  const hasUrgent = urgentTotal > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10" dir="rtl">
      <DashboardOfflineCapture data={{
        urgentTotal,
        expiringTotal,
        workersCount: workers.length,
        vehiclesCount: vehicles.length,
        heavyCount: heavy.length,
        liftingCount: lifting.length,
      }} />

      {/* Header */}
      <div className="mb-8">
        <span className="text-xs font-medium text-orange-500 bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-100">
          {role === 'viewer' ? 'צפייה בלבד' : 'ניהול'}
        </span>
        <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-1">SafeDoc</h1>
        <p className="text-sm text-gray-500">מערכת ניהול מסמכי בטיחות לעובדים וכלים</p>
      </div>

      {/* Alert — red for expired/missing, yellow for expiring-only */}
      {hasUrgent ? (
        <Link
          href="/issues?status=urgent"
          className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 mb-6 hover:bg-red-100 transition-colors"
        >
          <span className="text-red-500 shrink-0"><IconAlert /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">
              {urgentTotal} פריטים דורשים טיפול מיידי
            </p>
            <p className="text-xs text-red-600 mt-0.5">מסמכים חסרים או פגי תוקף</p>
          </div>
          <span className="text-red-400 text-xs font-medium shrink-0">צפה בכולם ←</span>
        </Link>
      ) : expiringTotal > 0 ? (
        <Link
          href="/issues?status=expiring"
          className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-2xl px-5 py-4 mb-6 hover:bg-yellow-100 transition-colors"
        >
          <span className="text-yellow-500 shrink-0"><IconAlert /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-yellow-800">
              {expiringTotal} פריטים דורשים מעקב
            </p>
            <p className="text-xs text-yellow-600 mt-0.5">מסמכים שעומדים לפוג בקרוב</p>
          </div>
          <span className="text-yellow-500 text-xs font-medium shrink-0">צפה בכולם ←</span>
        </Link>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <StatBox
          count={urgentTotal}
          label="פריטים לא תקינים"
          sublabel="מסמכים חסרים / פגי תוקף"
          href="/issues?status=urgent"
          color="red"
        />
        <StatBox
          count={expiringTotal}
          label="עומדים לפוג"
          sublabel="תוך 14 ימים"
          href="/issues?status=expiring"
          color="orange"
        />
        <StatBox
          count={unhandledFeedback}
          label="פניות ממתינות"
          sublabel={isAdmin ? 'לא טופלו' : ''}
          href={isAdmin ? '/feedback' : '/submit-feedback'}
          color="blue"
        />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <DashboardCard
          href="/workers"
          icon={IconWorkers}
          title="עובדים"
          description="ניהול תיקי עובדים, מסמכי זהות, תדריכי בטיחות ואישורי עבודה בגובה"
          color="text-orange-500" bg="bg-orange-50" border="border-orange-100" hoverBorder="hover:border-orange-300"
          counts={workerCounts}
        />
        <DashboardCard
          href="/site-managers"
          icon={IconSiteManager}
          title="מנהלי עבודה"
          description="ניהול מנהלי עבודה, רישיונות רכב וביטוחים"
          color="text-blue-600" bg="bg-blue-50" border="border-blue-100" hoverBorder="hover:border-blue-300"
          counts={managerCounts}
        />
        <DashboardCard
          href="/vehicles"
          icon={IconVehicle}
          title="רכבים"
          description="ניהול רכבי עבודה, רישיונות וביטוחים"
          color="text-sky-600" bg="bg-sky-50" border="border-sky-100" hoverBorder="hover:border-sky-300"
          counts={vehicleCounts}
        />
        <DashboardCard
          href="/heavy-equipment"
          icon={IconExcavator}
          title='כלי צמ"ה'
          description='ניהול רישיונות, ביטוחים ובדיקות תקופתיות לכלי צמ"ה'
          color="text-yellow-600" bg="bg-yellow-50" border="border-yellow-100" hoverBorder="hover:border-yellow-300"
          counts={heavyCounts}
        />
        <DashboardCard
          href="/lifting-equipment"
          icon={IconLift}
          title="ציוד הרמה"
          description="מעקב אחר ציוד הרמה — חגורות, שאקלים, שרשראות ועוד"
          color="text-purple-500" bg="bg-purple-50" border="border-purple-100" hoverBorder="hover:border-purple-300"
          counts={liftingCounts}
        />
        <DashboardCard
          href="/subcontractors"
          icon={IconSubcontractors}
          title="קבלני משנה"
          description="ניהול קבלני משנה ואנשי קשר"
          color="text-green-500" bg="bg-green-50" border="border-green-100" hoverBorder="hover:border-green-300"
        />
        {isAdmin && (
          <DashboardCard
            href="/feedback"
            icon={IconFeedback}
            title="פניות"
            description="פניות ומשובים שהתקבלו מהמשתמשים"
            color="text-gray-500" bg="bg-gray-100" border="border-gray-200" hoverBorder="hover:border-gray-400"
            counts={unhandledFeedback > 0 ? { urgent: 0, expiring: unhandledFeedback } : { urgent: 0, expiring: 0 }}
          />
        )}
      </div>

      {/* Link to issues */}
      {(urgentTotal > 0 || expiringTotal > 0) && (
        <div className="mt-8 text-center">
          <Link
            href="/issues"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
          >
            צפה בכל הליקויים ({urgentTotal + expiringTotal} סה&quot;כ)
          </Link>
        </div>
      )}
    </div>
  );
}
