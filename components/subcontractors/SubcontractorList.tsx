'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Subcontractor } from '@/types';

interface Props {
  initialSubcontractors: Subcontractor[];
}

interface FormState {
  name: string;
  contact_name: string;
  phone: string;
  notes: string;
}

const emptyForm: FormState = { name: '', contact_name: '', phone: '', notes: '' };

export default function SubcontractorList({ initialSubcontractors }: Props) {
  const router = useRouter();
  const [list, setList] = useState<Subcontractor[]>(initialSubcontractors);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(emptyForm);
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd() {
    if (!addForm.name.trim()) { setAddError('שם קבלן נדרש'); return; }
    setAddLoading(true);
    setAddError('');
    try {
      const res = await fetch('/api/subcontractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const json = await res.json();
      if (!res.ok) { setAddError(json.error ?? 'שגיאה'); return; }
      setList((prev) => [...prev, json].sort((a, b) => a.name.localeCompare(b.name, 'he')));
      setAddForm(emptyForm);
      setShowAddForm(false);
      router.refresh();
    } catch {
      setAddError('שגיאת תקשורת');
    } finally {
      setAddLoading(false);
    }
  }

  function startEdit(sub: Subcontractor) {
    setEditingId(sub.id);
    setEditForm({
      name: sub.name,
      contact_name: sub.contact_name ?? '',
      phone: sub.phone ?? '',
      notes: sub.notes ?? '',
    });
    setEditError('');
  }

  async function handleSaveEdit() {
    if (!editForm.name.trim()) { setEditError('שם קבלן נדרש'); return; }
    setEditLoading(true);
    setEditError('');
    try {
      const res = await fetch(`/api/subcontractors/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (!res.ok) { setEditError(json.error ?? 'שגיאה'); return; }
      setList((prev) =>
        prev
          .map((s) => (s.id === editingId ? json : s))
          .sort((a, b) => a.name.localeCompare(b.name, 'he'))
      );
      setEditingId(null);
      router.refresh();
    } catch {
      setEditError('שגיאת תקשורת');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`למחוק את "${name}"? עובדים המשויכים לקבלן זה לא יימחקו, אך הקישור יוסר.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/subcontractors/${id}`, { method: 'DELETE' });
      if (!res.ok) { alert('שגיאה במחיקה'); return; }
      setList((prev) => prev.filter((s) => s.id !== id));
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* כפתור הוספה */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-3 border-2 border-dashed border-orange-300 rounded-xl text-orange-500 font-medium hover:border-orange-400 hover:bg-orange-50 transition-colors"
        >
          + הוסף קבלן משנה
        </button>
      )}

      {/* טופס הוספה */}
      {showAddForm && (
        <SubcontractorForm
          form={addForm}
          onChange={setAddForm}
          onSave={handleAdd}
          onCancel={() => { setShowAddForm(false); setAddForm(emptyForm); setAddError(''); }}
          error={addError}
          loading={addLoading}
          title="קבלן משנה חדש"
        />
      )}

      {/* רשימה */}
      {list.length === 0 && !showAddForm && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">אין קבלני משנה עדיין</p>
          <p className="text-sm mt-1">לחץ על "הוסף קבלן משנה" כדי להתחיל</p>
        </div>
      )}

      {list.map((sub) =>
        editingId === sub.id ? (
          <SubcontractorForm
            key={sub.id}
            form={editForm}
            onChange={setEditForm}
            onSave={handleSaveEdit}
            onCancel={() => { setEditingId(null); setEditError(''); }}
            error={editError}
            loading={editLoading}
            title="עריכת קבלן משנה"
          />
        ) : (
          <div key={sub.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-base">{sub.name}</h3>
                {sub.contact_name && (
                  <p className="text-sm text-gray-600 mt-0.5">איש קשר: {sub.contact_name}</p>
                )}
                {sub.phone && (
                  <p className="text-sm text-gray-500 mt-0.5" dir="ltr">{sub.phone}</p>
                )}
                {sub.notes && (
                  <p className="text-sm text-gray-400 mt-1">{sub.notes}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0 mr-3">
                <button
                  onClick={() => startEdit(sub)}
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  עריכה
                </button>
                <button
                  onClick={() => handleDelete(sub.id, sub.name)}
                  disabled={deletingId === sub.id}
                  className="px-3 py-1.5 text-xs border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {deletingId === sub.id ? 'מוחק...' : 'מחיקה'}
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function SubcontractorForm({
  form,
  onChange,
  onSave,
  onCancel,
  error,
  loading,
  title,
}: {
  form: FormState;
  onChange: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  error: string;
  loading: boolean;
  title: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-orange-200 p-5 space-y-3">
      <h3 className="font-semibold text-gray-900">{title}</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">שם קבלן *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="שם חברת הקבלן"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">איש קשר</label>
        <input
          type="text"
          value={form.contact_name}
          onChange={(e) => onChange({ ...form, contact_name: e.target.value })}
          placeholder="שם איש הקשר"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => onChange({ ...form, phone: e.target.value })}
          placeholder="050-0000000"
          dir="ltr"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
        <textarea
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
          placeholder="הערות נוספות..."
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={loading}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
        >
          {loading ? 'שומר...' : 'שמור'}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
