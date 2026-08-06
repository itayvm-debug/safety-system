'use client';

import { useState } from 'react';
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
  currentUserId: string;
  initialMembers: MemberWithProfile[];
}

type AddFlow = 'existing' | 'create' | null;

const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: 'בעלים',
  admin: 'מנהל',
  member: 'חבר',
};

const ROLE_CHIP: Record<CompanyRole, string> = {
  owner: 'bg-purple-100 text-purple-700 border-purple-200',
  admin: 'bg-orange-100 text-orange-700 border-orange-200',
  member: 'bg-blue-50 text-blue-700 border-blue-200',
};

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent';

export default function CompanyMembersClient({
  companyName,
  currentUserId,
  initialMembers,
}: Props) {
  const [members, setMembers] = useState<MemberWithProfile[]>(initialMembers);
  const [addFlow, setAddFlow] = useState<AddFlow>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<CompanyRole | 'all'>('all');

  function handleAdded(m: MemberWithProfile) {
    setMembers(prev => [...prev, m]);
    setAddFlow(null);
  }

  function handleUpdated(m: MemberWithProfile) {
    setMembers(prev => prev.map(x => (x.id === m.id ? { ...x, ...m } : x)));
  }

  function handleRemoved(memberId: string) {
    setMembers(prev => prev.filter(x => x.id !== memberId));
  }

  const filtered = members.filter(m => {
    if (roleFilter !== 'all' && m.role !== roleFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        m.profile?.full_name?.toLowerCase().includes(q) ||
        m.profile?.email?.toLowerCase().includes(q) ||
        m.profile?.username?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeCount = members.filter(m => m.is_active).length;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">משתמשי חברת {companyName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{activeCount} חברים פעילים</p>
        </div>
        <button
          onClick={() => setAddFlow('existing')}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors shrink-0"
        >
          <span className="text-lg leading-none">+</span>
          הוסף משתמש לחברה
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="חיפוש לפי שם, מייל..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent w-56"
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value as CompanyRole | 'all')}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
        >
          <option value="all">כל התפקידים</option>
          <option value="owner">בעלים</option>
          <option value="admin">מנהל</option>
          <option value="member">חבר</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">👥</p>
            <p className="font-medium">{search || roleFilter !== 'all' ? 'לא נמצאו תוצאות' : 'אין חברים עדיין'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">שם</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">מייל</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">תפקיד</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">סטטוס</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(m => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    isSelf={m.user_id === currentUserId}
                    onUpdated={handleUpdated}
                    onRemoved={handleRemoved}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addFlow === 'existing' && (
        <AddExistingModal
          onClose={() => setAddFlow(null)}
          onAdded={handleAdded}
          onSwitchToCreate={() => setAddFlow('create')}
        />
      )}
      {addFlow === 'create' && (
        <CreateUserModal
          onClose={() => setAddFlow(null)}
          onAdded={handleAdded}
          onSwitchToExisting={() => setAddFlow('existing')}
        />
      )}
    </div>
  );
}

function MemberRow({
  member: m,
  isSelf,
  onUpdated,
  onRemoved,
}: {
  member: MemberWithProfile;
  isSelf: boolean;
  onUpdated: (m: MemberWithProfile) => void;
  onRemoved: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  async function handleRoleChange(newRole: CompanyRole) {
    if (isSelf) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/companies/members/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        onUpdated({ ...m, role: newRole });
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'שגיאה בעדכון');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive() {
    if (isSelf) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/companies/members/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !m.is_active }),
      });
      if (res.ok) {
        onUpdated({ ...m, is_active: !m.is_active });
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'שגיאה בעדכון');
      }
    } finally {
      setLoading(false);
    }
  }

  async function confirmRemove() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/companies/members/${m.id}`, { method: 'DELETE' });
      if (res.ok) {
        setShowRemoveModal(false);
        onRemoved(m.id);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'שגיאה בהסרה');
        setShowRemoveModal(false);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <tr className={`hover:bg-gray-50 transition-colors ${!m.is_active ? 'opacity-60' : ''}`}>
        <td className="px-4 py-3">
          <p className="font-medium text-gray-900">{m.profile?.full_name ?? '—'}</p>
          {m.profile?.username && (
            <p className="text-xs text-gray-400 font-mono">{m.profile.username}</p>
          )}
          {isSelf && <p className="text-xs text-orange-500">(אתה)</p>}
          {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
        </td>
        <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{m.profile?.email ?? '—'}</td>
        <td className="px-4 py-3">
          {isSelf ? (
            <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_CHIP[m.role]}`}>
              {ROLE_LABELS[m.role]}
            </span>
          ) : (
            <select
              value={m.role}
              disabled={loading}
              onChange={e => handleRoleChange(e.target.value as CompanyRole)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-50"
            >
              <option value="owner">בעלים</option>
              <option value="admin">מנהל</option>
              <option value="member">חבר</option>
            </select>
          )}
        </td>
        <td className="px-4 py-3">
          {isSelf ? (
            <span className="text-xs text-gray-400">—</span>
          ) : (
            <button
              onClick={handleToggleActive}
              disabled={loading}
              className={`text-xs px-2 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                m.is_active
                  ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                  : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
              }`}
            >
              {m.is_active ? 'פעיל' : 'מושבת'}
            </button>
          )}
        </td>
        <td className="px-4 py-3">
          {!isSelf && (
            <button
              onClick={() => setShowRemoveModal(true)}
              disabled={loading}
              className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              הסר
            </button>
          )}
        </td>
      </tr>

      {showRemoveModal && (
        <tr>
          <td colSpan={5} className="p-0">
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              dir="rtl"
            >
              <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-2">הסר משתמש מהחברה</h2>
                <p className="text-sm text-gray-600 mb-5">
                  האם להסיר את <span className="font-semibold">{m.profile?.full_name ?? 'המשתמש'}</span> מהחברה?
                  ניתן להוסיפו שוב בעתיד.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowRemoveModal(false)}
                    disabled={loading}
                    className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={confirmRemove}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 min-w-[80px]"
                  >
                    {loading ? 'מסיר...' : 'הסר'}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AddExistingModal({
  onClose,
  onAdded,
  onSwitchToCreate,
}: {
  onClose: () => void;
  onAdded: (m: MemberWithProfile) => void;
  onSwitchToCreate: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CompanyRole>('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/companies/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'שגיאה בהוספה');
        return;
      }
      onAdded(data);
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalWrapper title="הוסף משתמש קיים לחברה" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">כתובת מייל *</label>
          <input
            type="email" required dir="ltr"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="user@example.com"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד בחברה</label>
          <select value={role} onChange={e => setRole(e.target.value as CompanyRole)} className={inputCls}>
            <option value="member">חבר</option>
            <option value="admin">מנהל</option>
            <option value="owner">בעלים</option>
          </select>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
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
        <p className="text-sm text-gray-500 text-center">
          המשתמש לא קיים עדיין?{' '}
          <button type="button" onClick={onSwitchToCreate} className="text-orange-500 hover:underline font-medium">
            צור משתמש חדש
          </button>
        </p>
      </form>
    </ModalWrapper>
  );
}

function CreateUserModal({
  onClose,
  onAdded,
  onSwitchToExisting,
}: {
  onClose: () => void;
  onAdded: (m: MemberWithProfile) => void;
  onSwitchToExisting: () => void;
}) {
  const [form, setForm] = useState({
    full_name: '',
    username: '',
    email: '',
    password: '',
    job_title: '',
    companyRole: 'member' as CompanyRole,
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
      const res = await fetch('/api/companies/members/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'שגיאה ביצירה');
        return;
      }
      onAdded(data);
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalWrapper title="צור משתמש חדש והוסף לחברה" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא *</label>
          <input
            type="text" required
            value={form.full_name} onChange={e => set('full_name', e.target.value)}
            placeholder="ישראל ישראלי"
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם משתמש *</label>
            <input
              type="text" required
              value={form.username} onChange={e => set('username', e.target.value)}
              placeholder="israel-israeli"
              autoCapitalize="none" autoCorrect="off" dir="ltr"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד בחברה</label>
            <select value={form.companyRole} onChange={e => set('companyRole', e.target.value)} className={inputCls}>
              <option value="member">חבר</option>
              <option value="admin">מנהל</option>
              <option value="owner">בעלים</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">מייל</label>
          <input
            type="email"
            value={form.email} onChange={e => set('email', e.target.value)}
            placeholder="mail@example.com"
            dir="ltr"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד עסקי</label>
          <input
            type="text"
            value={form.job_title} onChange={e => set('job_title', e.target.value)}
            placeholder="מנהל בטיחות"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה ראשונית *</label>
          <input
            type="password" required minLength={8}
            value={form.password} onChange={e => set('password', e.target.value)}
            placeholder="לפחות 8 תווים"
            className={inputCls}
          />
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={loading}
            className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {loading ? 'יוצר...' : 'צור והוסף'}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50 transition-colors">
            ביטול
          </button>
        </div>
        <p className="text-sm text-gray-500 text-center">
          המשתמש כבר קיים?{' '}
          <button type="button" onClick={onSwitchToExisting} className="text-orange-500 hover:underline font-medium">
            הוסף לפי מייל
          </button>
        </p>
      </form>
    </ModalWrapper>
  );
}

function ModalWrapper({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      dir="rtl"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">{children}</div>
  );
}
