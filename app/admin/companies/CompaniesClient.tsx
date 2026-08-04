'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Company } from '@/types';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  initialCompanies: Company[];
}

export default function CompaniesClient({ initialCompanies }: Props) {
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [showCreate, setShowCreate] = useState(false);

  function handleCreated(c: Company) {
    setCompanies(prev => [...prev, c]);
    setShowCreate(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ניהול חברות</h1>
          <p className="text-sm text-gray-500 mt-0.5">{companies.length} חברות במערכת</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          חברה חדשה
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {companies.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🏢</p>
            <p className="font-medium">אין חברות עדיין</p>
            <p className="text-sm mt-1">לחץ &quot;חברה חדשה&quot; כדי להוסיף את הראשונה</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">שם החברה</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">Slug</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">ח.פ.</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">סטטוס</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">נוצרה</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {companies.map(c => (
                  <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${!c.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{c.name}</p>
                        {c.name_en && <p className="text-xs text-gray-400">{c.name_en}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 hidden sm:table-cell">{c.slug ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{c.registration ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${c.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {c.is_active ? 'פעילה' : 'מושבתת'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                      {format(parseISO(c.created_at), 'dd/MM/yyyy', { locale: he })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/companies/${c.id}`}
                        className="text-xs text-orange-500 hover:text-orange-600 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors whitespace-nowrap"
                      >
                        פרטים
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateCompanyModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}

function CreateCompanyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Company) => void;
}) {
  const [form, setForm] = useState({
    name: '', name_en: '', slug: '', registration: '',
    address: '', phone: '', contact_email: '', safety_email: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === 'name' && !form.slug) {
      const autoSlug = value.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '').replace(/-+/g, '-');
      setForm(prev => ({ ...prev, name: value, slug: autoSlug }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה ביצירה'); return; }
      onCreated(data);
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">חברה חדשה</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם החברה *</label>
              <input type="text" required value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="חברת הבנייה בע״מ" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם באנגלית</label>
              <input type="text" value={form.name_en} onChange={e => set('name_en', e.target.value)}
                placeholder="Construction Co Ltd" dir="ltr" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
            <input type="text" required value={form.slug} onChange={e => set('slug', e.target.value)}
              placeholder="construction-co" dir="ltr" className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">אותיות קטנות, ספרות ומקפים בלבד</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ח.פ. / ע.מ.</label>
              <input type="text" value={form.registration} onChange={e => set('registration', e.target.value)}
                placeholder="510000000" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="03-1234567" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">כתובת</label>
            <input type="text" value={form.address} onChange={e => set('address', e.target.value)}
              placeholder="רחוב הבנייה 1, תל אביב" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מייל יצירת קשר</label>
              <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)}
                placeholder="info@company.com" dir="ltr" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מייל בטיחות</label>
              <input type="email" value={form.safety_email} onChange={e => set('safety_email', e.target.value)}
                placeholder="safety@company.com" dir="ltr" className={inputCls} />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">{error}</div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {loading ? 'יוצר...' : 'צור חברה'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50 transition-colors">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent';
