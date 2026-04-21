'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Vehicle } from '@/types';

interface Props {
  vehicle?: Vehicle;
  managers: { id: string; full_name: string }[];
}

const VEHICLE_TYPE_PRESETS = ['טנדר', 'פרייבט', 'מסחרית', 'רכב שטח', 'ואן', 'משאית קלה'];

export default function VehicleForm({ vehicle, managers }: Props) {
  const router = useRouter();
  const isEdit = !!vehicle;

  const [formData, setFormData] = useState({
    vehicle_type: vehicle?.vehicle_type ?? '',
    model: vehicle?.model ?? '',
    vehicle_number: vehicle?.vehicle_number ?? '',
    assigned_manager_id: vehicle?.assigned_manager_id ?? '',
    project_name: vehicle?.project_name ?? '',
    notes: vehicle?.notes ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(key: string, value: string) {
    setFormData((p) => ({ ...p, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!formData.vehicle_type.trim()) { setError('יש לבחור סוג רכב'); return; }
    if (!formData.vehicle_number.trim()) { setError('יש להזין מספר רכב'); return; }

    setLoading(true);
    try {
      const url = isEdit ? `/api/vehicles/${vehicle!.id}` : '/api/vehicles';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_type: formData.vehicle_type.trim(),
          model: formData.model.trim() || null,
          vehicle_number: formData.vehicle_number.trim(),
          assigned_manager_id: formData.assigned_manager_id || null,
          project_name: formData.project_name.trim() || null,
          notes: formData.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה'); return; }
      router.push(`/vehicles/${data.id}`);
      router.refresh();
    } catch {
      setError('שגיאת תקשורת — נסה שנית');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            סוג רכב <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            list="vehicle-type-presets"
            value={formData.vehicle_type}
            onChange={(e) => set('vehicle_type', e.target.value)}
            placeholder="למשל: טנדר, מסחרית..."
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <datalist id="vehicle-type-presets">
            {VEHICLE_TYPE_PRESETS.map((t) => <option key={t} value={t} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">דגם</label>
          <input
            type="text"
            value={formData.model}
            onChange={(e) => set('model', e.target.value)}
            placeholder="למשל: טויוטה היילקס"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          מספר רכב <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.vehicle_number}
          onChange={(e) => set('vehicle_number', e.target.value)}
          placeholder="123-45-678"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          dir="ltr"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          מנהל עבודה משויך <span className="text-gray-400 text-xs">(אופציונלי)</span>
        </label>
        <select
          value={formData.assigned_manager_id}
          onChange={(e) => set('assigned_manager_id', e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
        >
          <option value="">ללא מנהל עבודה קבוע</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          פרויקט <span className="text-gray-400 text-xs">(אופציונלי)</span>
        </label>
        <input
          type="text"
          value={formData.project_name}
          onChange={(e) => set('project_name', e.target.value)}
          placeholder="שם הפרויקט / האתר"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          הערות <span className="text-gray-400 text-xs">(אופציונלי)</span>
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
          placeholder="הערות חופשיות..."
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'שומר...' : isEdit ? 'שמור שינויים' : 'צור רכב'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
