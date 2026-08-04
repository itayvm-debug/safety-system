'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Company } from '@/types';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import { useRouter } from 'next/navigation';

interface Props {
  company: Company;
  memberCount: number;
}

export default function CompanyDetailClient({ company: initial, memberCount }: Props) {
  const router = useRouter();
  const [company, setCompany] = useState<Company>(initial);
  const [showEdit, setShowEdit] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleToggleActive() {
    const action = company.is_active ? 'להשבית' : 'להפעיל מחדש';
    if (!confirm(`${action} את ${company.name}?`)) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !company.is_active }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCompany(updated);
      }
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link href="/admin/companies" className="hover:text-gray-700">חברות</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">{company.name}</span>
      </nav>

      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${company.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {company.is_active ? 'פעילה' : 'מושבתת'}
            </span>
          </div>
          {company.name_en && <p className="text-sm text-gray-500 mt-0.5">{company.name_en}</p>}
          {company.slug && <p className="text-xs font-mono text-gray-400 mt-0.5">{company.slug}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowEdit(true)}
            className="text-sm border border-gray-200 bg-white text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            עריכה
          </button>
          <button
            onClick={handleToggleActive}
            disabled={toggling}
            className={`text-sm px-3 py-2 rounded-xl transition-colors disabled:opacity-50 ${
              company.is_active
                ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
            }`}
          >
            {toggling ? '...' : company.is_active ? 'השבת' : 'הפעל'}
          </button>
        </div>
      </div>

      {/* info grid */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-700 mb-4 text-sm">פרטי החברה</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <InfoRow label="ח.פ. / ע.מ." value={company.registration} />
          <InfoRow label="טלפון" value={company.phone} />
          <InfoRow label="כתובת" value={company.address} />
          <InfoRow label="מייל יצירת קשר" value={company.contact_email} />
          <InfoRow label="מייל בטיחות" value={company.safety_email} />
          <InfoRow label="חברים פעילים" value={String(memberCount)} />
          <InfoRow label="נוצרה" value={format(parseISO(company.created_at), 'dd/MM/yyyy', { locale: he })} />
          <InfoRow label="עודכנה" value={format(parseISO(company.updated_at), 'dd/MM/yyyy', { locale: he })} />
        </dl>
      </div>

      {/* quick nav */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/admin/companies/${company.id}/members`}
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-orange-300 hover:bg-orange-50 transition-colors"
        >
          <p className="font-semibold text-gray-900">חברי החברה</p>
          <p className="text-sm text-gray-500 mt-0.5">{memberCount} חברים פעילים</p>
        </Link>
        <Link
          href={`/admin/companies/${company.id}/settings`}
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-orange-300 hover:bg-orange-50 transition-colors"
        >
          <p className="font-semibold text-gray-900">הגדרות</p>
          <p className="text-sm text-gray-500 mt-0.5">Branding, Features, UI</p>
        </Link>
      </div>

      {showEdit && (
        <EditCompanyModal
          company={company}
          onClose={() => setShowEdit(false)}
          onUpdated={(c) => { setCompany(c); setShowEdit(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-gray-500 text-xs">{label}</dt>
      <dd className="font-medium text-gray-900 mt-0.5">{value ?? '—'}</dd>
    </div>
  );
}

function EditCompanyModal({
  company,
  onClose,
  onUpdated,
}: {
  company: Company;
  onClose: () => void;
  onUpdated: (c: Company) => void;
}) {
  const [form, setForm] = useState({
    name: company.name,
    name_en: company.name_en ?? '',
    slug: company.slug ?? '',
    registration: company.registration ?? '',
    address: company.address ?? '',
    phone: company.phone ?? '',
    contact_email: company.contact_email ?? '',
    safety_email: company.safety_email ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה בעדכון'); return; }
      onUpdated(data);
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
          <h2 className="font-semibold text-gray-900">עריכת {company.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם החברה *</label>
              <input type="text" required value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם באנגלית</label>
              <input type="text" value={form.name_en} onChange={e => set('name_en', e.target.value)} dir="ltr" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
            <input type="text" value={form.slug} onChange={e => set('slug', e.target.value)} dir="ltr" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ח.פ.</label>
              <input type="text" value={form.registration} onChange={e => set('registration', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">כתובת</label>
            <input type="text" value={form.address} onChange={e => set('address', e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מייל יצירת קשר</label>
              <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} dir="ltr" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מייל בטיחות</label>
              <input type="email" value={form.safety_email} onChange={e => set('safety_email', e.target.value)} dir="ltr" className={inputCls} />
            </div>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">{error}</div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {loading ? 'שומר...' : 'שמור שינויים'}
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
