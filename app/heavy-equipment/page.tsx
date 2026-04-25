import HeavyEquipmentList from '@/components/heavy-equipment/HeavyEquipmentList';
import { NewEntityButton } from '@/components/ui/NewEntityButton';

export default function HeavyEquipmentPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">כלי צמ&quot;ה</h1>
          <p className="text-sm text-gray-500 mt-1">ניהול ציוד כבד ורכבי עבודה</p>
        </div>
        <NewEntityButton href="/heavy-equipment/new" label='+ כלי צמ"ה חדש' />
      </div>
      <HeavyEquipmentList />
    </div>
  );
}
