import Link from 'next/link';
import LiftingEquipmentList from '@/components/lifting-equipment/LiftingEquipmentList';

export default function LiftingEquipmentPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ציוד הרמה</h1>
          <p className="text-sm text-gray-500 mt-1">עגורנים, מלגזות וציוד הרמה נוסף</p>
        </div>
        <Link
          href="/lifting-equipment/new"
          className="bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors shrink-0"
        >
          + ציוד הרמה חדש
        </Link>
      </div>
      <LiftingEquipmentList />
    </div>
  );
}
