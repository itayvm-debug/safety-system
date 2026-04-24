import Link from 'next/link';
import HeavyEquipmentList from '@/components/heavy-equipment/HeavyEquipmentList';

export default function HeavyEquipmentPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">כלי צמ&quot;ה</h1>
          <p className="text-sm text-gray-500 mt-1">ניהול ציוד כבד ורכבי עבודה</p>
        </div>
        <Link
          href="/heavy-equipment/new"
          className="bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors shrink-0"
        >
          + כלי צמ&quot;ה חדש
        </Link>
      </div>
      <HeavyEquipmentList />
    </div>
  );
}
