import LiftingEquipmentList from '@/components/lifting-equipment/LiftingEquipmentList';
import { NewEntityButton } from '@/components/ui/NewEntityButton';

export default function LiftingEquipmentPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ציוד הרמה</h1>
          <p className="text-sm text-gray-500 mt-1">עגורנים, מלגזות וציוד הרמה נוסף</p>
        </div>
        <NewEntityButton href="/lifting-equipment/new" label="+ ציוד הרמה חדש" />
      </div>
      <LiftingEquipmentList />
    </div>
  );
}
