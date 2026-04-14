import { createServiceClient } from '@/lib/supabase/server';
import WorkerList from '@/components/workers/WorkerList';
import { WorkerWithDocuments } from '@/types';

export const dynamic = 'force-dynamic';

export default async function WorkersPage() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('workers')
    .select(`*, documents(*), safety_briefings(*), subcontractor:subcontractors(id, name)`)
    .order('full_name');

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
        שגיאה בטעינת הנתונים: {error.message}
      </div>
    );
  }

  const workers: WorkerWithDocuments[] = (data as WorkerWithDocuments[]) ?? [];

  // יצירת signed URLs לתמונות — קריאה אחת לשרת לכל העובדים
  const photoUrls: Record<string, string> = {};
  const serviceClient = createServiceClient();
  const workersWithPhotos = workers.filter((w) => w.photo_url);

  await Promise.all(
    workersWithPhotos.map(async (w) => {
      const { data: signed } = await serviceClient.storage
        .from('worker-files')
        .createSignedUrl(w.photo_url!, 3600);
      if (signed?.signedUrl) photoUrls[w.id] = signed.signedUrl;
    })
  );

  return <WorkerList workers={workers} photoUrls={photoUrls} />;
}
