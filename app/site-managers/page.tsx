import SiteManagerList from '@/components/workers/SiteManagerList';

export const dynamic = 'force-dynamic';

export default function SiteManagersPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <SiteManagerList />
    </div>
  );
}
