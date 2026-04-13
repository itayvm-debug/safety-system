'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HeavyEquipment, Subcontractor } from '@/types';

interface Props {
  equipment?: HeavyEquipment;
}

export default function EquipmentForm({ equipment }: Props) {
  const router = useRouter();
  const isEdit = !!equipment;

  const [form, setForm] = useState({
    description: equipment?.description ?? '',
    license_number: equipment?.license_number ?? '',
    subcontractor_id: equipment?.subcontractor_id ?? '',
    project_name: equipment?.project_name ?? '',
  });
  const [subcontractors, setSubcontractors] = useState<Pick<Subcontractor, 'id' | 'name'>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/subcontractors').then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setSubcontractors(d);
    }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim()) { setError('תיאור נדרש'); return; }
    setLoading(true); setError('');

    try {
      const url = isEdit ? `/api/heavy-equipment/${equipment!.id}` : '/api/heavy-equipment';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.description.trim(),
          license_number: form.license_number.trim() || null,
          subcontractor_id: form.subcontractor_id || null,
          project_name: form.project_name.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה'); return; }
      router.push(`/heavy-equipment/${data.id}`);
      router.refresh();
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">תיאור הציוד <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="למשל: מנוף טאדאנו 50 טון"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">מספר רישיון <span className="text-gray-400 text-xs">(אופציונלי)</span></label>
        <input
          type="text"
          value={form.license_number}
          onChange={(e) => setForm({ ...form, license_number: e.target.value })}
          placeholder="מספר רישוי"
          dir="ltr"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">קבלן משנה <span className="text-gray-400 text-xs">(אופציונלי)</span></label>
        <select
          value={form.subcontractor_id}
          onChange={(e) => setForm({ ...form, subcontractor_id: e.target.value })}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
        >
          <option value="">— ללא קבלן משנה —</option>
          {subcontractors.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">פרויקט <span className="text-gray-400 text-xs">(אופציונלי)</span></label>
        <input
          type="text"
          value={form.project_name}
          onChange={(e) => setForm({ ...form, project_name: e.target.value })}
          placeholder="שם הפרויקט / האתר"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {loading ? 'שומר...' : isEdit ? 'שמור שינויים' : 'הוסף ציוד'}
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
