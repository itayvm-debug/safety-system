import NewWorkerWizard from '@/components/workers/NewWorkerWizard';
import Link from 'next/link';

export default function NewWorkerPage() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/workers" className="text-gray-400 hover:text-gray-600">
          ← רשימת עובדים
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">עובד חדש</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <NewWorkerWizard />
      </div>
    </div>
  );
}
