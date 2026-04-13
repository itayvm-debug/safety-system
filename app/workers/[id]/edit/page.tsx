import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import WorkerForm from '@/components/workers/WorkerForm';
import { Worker } from '@/types';

export const dynamic = 'force-dynamic';

export default async function EditWorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) notFound();

  const worker = data as Worker;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/workers/${id}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← חזרה לעובד
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">עריכת פרטי עובד</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <WorkerForm worker={worker} />
      </div>
    </div>
  );
}
