'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import type { CompanyRole } from '@/types';

interface MemberWithProfile {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyRole;
  is_active: boolean;
  joined_at: string;
  profile: { full_name: string; email: string; username: string | null; role: string } | null;
}

interface Props {
  companyId: string;
  companyName: string;
  initialMembers: MemberWithProfile[];
}

const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: 'בעלים',
  admin: 'מנהל',
  member: 'חבר',
};

const ROLE_COLORS: Record<CompanyRole, string> = {
  owner: 'bg-purple-100 text-purple-700 border-purple-200',
  admin: 'bg-orange-100 text-orange-700 border-orange-200',
  member: 'bg-blue-50 text-blue-700 border-blue-200',
};

export default function MembersClient({ companyId, companyName, initialMembers }: Props) {
  const [members, setMembers] = useState<MemberWithProfile[]>(initialMembers);
  const [showAdd, setShowAdd] = useState(false);

  function handleAdded(m: MemberWithProfile) {
    setMembers(prev => [...prev, m]);
    setShowAdd(false);
  }

  function handleUpdated(m: MemberWithProfile) {
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x));
  }

  function handleRemoved(memberId: string) {
    setMembers(prev => prev.filter(x => x.id !== memberId));
  }

  return (
    <div className="space-y-5">
      <nav className="text-sm text-gray-500">
        <Link href="/admin/companies" className="hover:text-gray-700">חברות</Link>
        <span className="mx-2">/</span>
        <Link href={`/admin/companies/${companyId}`} className="hover:text-gray-700">{companyName}</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">חברים</span>
      </nav>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">חברי {companyName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{members.filter(m => m.is_active).length} חברים פעילים</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          הוסף חבר
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {members.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">👥</p>
            <p className="font-medium">אין חברים עדיין</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">שם</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">מייל</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">תפקיד בחברה</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">סטטוס</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">הצטרף</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {members.map(m => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    companyId={companyId}
                    onUpdated={handleUpdated}
                    onRemoved={handleRemoved}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddMemberModal
          companyId={companyId}
          onClose={() => setShowAdd(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}

function MemberRow({
  member: m,
  companyId,
  onUpdated,
  onRemoved,
}: {
  member: MemberWithProfile;
  companyId: string;
  onUpdated: (m: MemberWithProfile) => void;
  onRemoved: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [removeError, setRemoveError] = useState('');

  async function handleRoleChange(newRole: CompanyRole) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/members/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) onUpdated({ ...m, role: newRole });
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    if (!confirm(`להסיר את ${m.profile?.full_name ?? 'החבר'} מהחברה?`)) return;
    setLoading(true);
    setRemoveError('');
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/members/${m.id}`, { method: 'DELETE' });
      if (res.ok) onRemoved(m.id);
      else {
        const data = await res.json().catch(() => ({}));
        setRemoveError(data.error ?? 'שגיאה בהסרה');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <tr className={`hover:bg-gray-50 transition-colors ${!m.is_active ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900">{m.profile?.full_name ?? '—'}</p>
        {m.profile?.username && <p className="text-xs text-gray-400 font-mono">{m.profile.username}</p>}
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{m.profile?.email ?? '—'}</td>
      <td className="px-4 py-3">
        <select
          value={m.role}
          disabled={loading}
          onChange={e => handleRoleChange(e.target.value as CompanyRole)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
        >
          <option value="owner">בעלים</option>
          <option value="admin">מנהל</option>
          <option value="member">חבר</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[m.role]}`}>
          {ROLE_LABELS[m.role]}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
        {format(parseISO(m.joined_at), 'dd/MM/yyyy', { locale: he })}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={handleRemove}
          disabled={loading}
          className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          הסר
        </button>
        {removeError && <p className="text-xs text-red-500 mt-1 whitespace-nowrap">{removeError}</p>}
      </td>
    </tr>
  );
}

function AddMemberModal({
  companyId,
  onClose,
  onAdded,
}: {
  companyId: string;
  onClose: () => void;
  onAdded: (m: MemberWithProfile) => void;
}) {
  const [form, setForm] = useState({ user_id: '', role: 'member' as CompanyRole });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה בהוספה'); return; }
      onAdded(data);
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">הוסף חבר לחברה</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מזהה משתמש (user_id) *</label>
            <input
              type="text" required dir="ltr"
              value={form.user_id} onChange={e => setForm(p => ({ ...p, user_id: e.target.value }))}
              placeholder="uuid של המשתמש"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as CompanyRole }))} className={inputCls}>
              <option value="member">חבר</option>
              <option value="admin">מנהל</option>
              <option value="owner">בעלים</option>
            </select>
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {loading ? 'מוסיף...' : 'הוסף'}
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
