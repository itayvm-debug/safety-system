'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Worker, WorkerType } from '@/types';

interface WorkerFormProps {
  worker?: Worker; // אם קיים — מצב עריכה
}

export default function WorkerForm({ worker }: WorkerFormProps) {
  const router = useRouter();
  const isEdit = !!worker;

  const [formData, setFormData] = useState({
    full_name: worker?.full_name ?? '',
    id_number: worker?.id_number ?? '',
    worker_type: (worker?.worker_type ?? 'israeli') as WorkerType,
    phone: worker?.phone ?? '',
    notes: worker?.notes ?? '',
    project_name: worker?.project_name ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const url = isEdit ? `/api/workers/${worker!.id}` : '/api/workers';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'שגיאה בשמירה');
        return;
      }

      router.push(`/workers/${data.id}`);
      router.refresh();
    } catch {
      setError('שגיאת תקשורת — נסה שנית');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* שם מלא */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          שם מלא <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="full_name"
          value={formData.full_name}
          onChange={handleChange}
          required
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="ישראל ישראלי"
        />
      </div>

      {/* מספר תעודת זהות */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          מספר תעודת זהות <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="id_number"
          value={formData.id_number}
          onChange={handleChange}
          required
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="123456789"
          dir="ltr"
        />
      </div>

      {/* סוג עובד */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          סוג עובד <span className="text-red-500">*</span>
        </label>
        <select
          name="worker_type"
          value={formData.worker_type}
          onChange={handleChange}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="israeli">ישראלי</option>
          <option value="foreign">עובד זר</option>
        </select>
        {formData.worker_type === 'foreign' && (
          <p className="text-xs text-amber-600 mt-1">
            עובד זר — נדרשת אשרת עבודה
          </p>
        )}
      </div>

      {/* טלפון */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          טלפון <span className="text-gray-400 text-xs">(אופציונלי)</span>
        </label>
        <input
          type="tel"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="050-0000000"
          dir="ltr"
        />
      </div>

      {/* פרויקט */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          פרויקט <span className="text-gray-400 text-xs">(אופציונלי)</span>
        </label>
        <input
          type="text"
          name="project_name"
          value={formData.project_name}
          onChange={handleChange}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="שם הפרויקט / האתר"
        />
      </div>

      {/* הערות */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          הערות <span className="text-gray-400 text-xs">(אופציונלי)</span>
        </label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
          placeholder="הערות חופשיות..."
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'שומר...' : isEdit ? 'שמור שינויים' : 'צור עובד'}
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
