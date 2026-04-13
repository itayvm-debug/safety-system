import Link from 'next/link';
import LiftingForm from '@/components/lifting-equipment/LiftingForm';

export default function NewLiftingEquipmentPage() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/lifting-equipment" className="text-gray-400 hover:text-gray-600 text-sm">
          ← רשימת ציוד הרמה
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">ציוד הרמה חדש</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <LiftingForm />
      </div>
    </div>
  );
}
