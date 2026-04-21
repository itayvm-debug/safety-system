'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Worker } from '@/types';
import { getWorkerIdentifierLabel, getWorkerIdentifierValue } from '@/lib/workers/identifier';

interface WorkerFormProps {
  worker?: Worker;
}

export default function WorkerForm({ worker }: WorkerFormProps) {
  const router = useRouter();
  const isEdit = !!worker;

  const [formData, setFormData] = useState({
    full_name: worker?.full_name ?? '',
    is_foreign_worker: worker?.is_foreign_worker ?? false,
    national_id: worker?.national_id ?? '',
    passport_number: worker?.passport_number ?? '',
    phone: worker?.phone ?? '',
    notes: worker?.notes ?? '',
    project_name: worker?.project_name ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isForeign = formData.is_foreign_worker;
  const identifierLabel = isForeign ? 'מספר דרכון' : 'תעודת זהות';
  const identifierValue = isForeign ? formData.passport_number : formData.national_id;

  function handleIdentifierChange(value: string) {
    if (isForeign) {
      setFormData((prev) => ({ ...prev, passport_number: value }));
    } else {
      setFormData((prev) => ({ ...prev, national_id: value }));
    }
  }

  function handleWorkerTypeChange(foreign: boolean) {
    setFormData((prev) => ({ ...prev, is_foreign_worker: foreign }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const identifierVal = isForeign ? formData.passport_number.trim() : formData.national_id.trim();
    if (!identifierVal) {
      setError(isForeign ? 'מספר דרכון נדרש' : 'מספר תעודת זהות נדרש');
      return;
    }

    setLoading(true);

    try {
      const url = isEdit ? `/api/workers/${worker!.id}` : '/api/workers';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formData.full_name.trim(),
          is_foreign_worker: isForeign,
          national_id: isForeign ? null : formData.national_id.trim() || null,
          passport_number: isForeign ? formData.passport_number.trim() || null : null,
          phone: formData.phone.trim() || null,
          notes: formData.notes.trim() || null,
          project_name: formData.project_name.trim() || null,
        }),
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
          value={formData.full_name}
          onChange={(e) => setFormData((p) => ({ ...p, full_name: e.target.value }))}
          required
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="ישראל ישראלי"
        />
      </div>

      {/* סוג עובד */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          סוג עובד <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleWorkerTypeChange(false)}
            className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              !isForeign
                ? 'bg-blue-50 border-blue-400 text-blue-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            ישראלי
          </button>
          <button
            type="button"
            onClick={() => handleWorkerTypeChange(true)}
            className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              isForeign
                ? 'bg-amber-50 border-amber-400 text-amber-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            עובד זר
          </button>
        </div>
        {isForeign && (
          <p className="text-xs text-amber-600 mt-1">עובד זר — נדרשת אשרת עבודה</p>
        )}
      </div>

      {/* מספר מזהה */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {identifierLabel} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={identifierValue}
          onChange={(e) => handleIdentifierChange(e.target.value)}
          required
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={isForeign ? 'מספר דרכון' : '123456789'}
          dir="ltr"
        />
      </div>

      {/* טלפון */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          טלפון <span className="text-gray-400 text-xs">(אופציונלי)</span>
        </label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
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
          value={formData.project_name}
          onChange={(e) => setFormData((p) => ({ ...p, project_name: e.target.value }))}
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
          value={formData.notes}
          onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
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
