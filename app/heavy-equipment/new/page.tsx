import Link from 'next/link';
import EquipmentForm from '@/components/heavy-equipment/EquipmentForm';

export default function NewHeavyEquipmentPage() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/heavy-equipment" className="text-gray-400 hover:text-gray-600 text-sm">
          ← רשימת כלי צמ"ה
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">כלי חדש</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <EquipmentForm />
      </div>
    </div>
  );
}
