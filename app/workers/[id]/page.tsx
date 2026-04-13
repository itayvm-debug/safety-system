import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { WorkerWithDocuments } from '@/types';
import WorkerDetail from '@/components/workers/WorkerDetail';

export const dynamic = 'force-dynamic';

export default async function WorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workers')
    .select(`*, documents(*), safety_briefings(*), subcontractor:subcontractors(id, name)`)
    .eq('id', id)
    .single();

  if (error || !data) notFound();

  // height_restrictions — בטבלה נפרדת, query נפרד כדי שלא יגרום ל-404 אם הטבלה עדיין לא קיימת
  const { data: heightData } = await supabase
    .from('height_restrictions')
    .select('*')
    .eq('worker_id', id)
    .order('created_at', { ascending: false });

  const worker = {
    ...data,
    height_restrictions: heightData ?? [],
  } as WorkerWithDocuments;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/workers" className="text-gray-400 hover:text-gray-600 text-sm">
          ← רשימת עובדים
        </Link>
      </div>
      <WorkerDetail worker={worker} />
    </div>
  );
}
