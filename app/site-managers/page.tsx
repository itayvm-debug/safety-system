import { createServiceClient } from '@/lib/supabase/server';
import SiteManagerList from '@/components/workers/SiteManagerList';
import { Worker } from '@/types';

export const dynamic = 'force-dynamic';

export default async function SiteManagersPage() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('is_responsible_site_manager', true)
    .eq('is_active', true)
    .order('full_name');

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
        שגיאה בטעינת הנתונים: {error.message}
      </div>
    );
  }

  const managers: Worker[] = (data as Worker[]) ?? [];

  // signed URLs לתמונות
  const photoUrls: Record<string, string> = {};
  await Promise.all(
    managers
      .filter((m) => m.photo_url)
      .map(async (m) => {
        const { data: signed } = await supabase.storage
          .from('worker-files')
          .createSignedUrl(m.photo_url!, 3600);
        if (signed?.signedUrl) photoUrls[m.id] = signed.signedUrl;
      })
  );

  return (
    <div className="max-w-2xl mx-auto">
      <SiteManagerList managers={managers} photoUrls={photoUrls} />
    </div>
  );
}
