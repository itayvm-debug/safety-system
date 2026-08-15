'use client';

import { useState } from 'react';
import type { CompanyRole } from '@/types';
import { broadcastSessionCompaniesChanged } from '@/lib/session/SessionCompaniesProvider';

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
  const [copyDone, setCopyDone] = useState(false);

  async function handleCopyLoginDetails() {
    const username = m.profile?.username;
    if (!username) return;
    const msg = buildInviteMessage(username);
    try {
      await navigator.clipboard.writeText(msg);
    } catch {
      const el = document.createElement('textarea');
      el.value = msg;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  }

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
        broadcastSessionCompaniesChanged();
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
        broadcastSessionCompaniesChanged();
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
        broadcastSessionCompaniesChanged();
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
          <div className="flex items-center gap-1">
            {m.profile?.username && (
              <button
                onClick={handleCopyLoginDetails}
                title="העתק פרטי כניסה"
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {copyDone ? '✓' : (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </button>
            )}
            {!isSelf && (
              <button
                onClick={() => setShowRemoveModal(true)}
                disabled={loading}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                הסר
              </button>
            )}
          </div>
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

function getLoginUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/login`;
}

function buildInviteMessage(username: string): string {
  return `היי, נפתח עבורך משתמש במערכת SafeDoc.\nכניסה למערכת:\n${getLoginUrl()}\nשם משתמש: ${username}\nאת הסיסמה אעביר לך בנפרד.`;
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
  const [createdData, setCreatedData] = useState<{ member: MemberWithProfile; profile: { full_name: string; username: string; email: string } } | null>(null);
  const [copyLinkDone, setCopyLinkDone] = useState(false);
  const [copyMsgDone, setCopyMsgDone] = useState(false);

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
      setCreatedData({ member: data, profile: data.profile });
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text: string, done: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      done(true);
      setTimeout(() => done(false), 2000);
    } catch {
      // fallback for browsers that block clipboard without interaction
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      done(true);
      setTimeout(() => done(false), 2000);
    }
  }

  // Success panel — shown after user is created
  if (createdData) {
    const { profile } = createdData;
    const loginUrl = getLoginUrl();
    const inviteMsg = buildInviteMessage(profile.username);
    const waUrl = `https://wa.me/?text=${encodeURIComponent(inviteMsg)}`;
    const canShare = typeof navigator !== 'undefined' && !!navigator.share;

    return (
      <ModalWrapper title="משתמש נוצר בהצלחה" onClose={() => { onAdded(createdData.member); onClose(); }}>
        <div className="space-y-4">
          {/* Success icon */}
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          </div>

          {/* User details */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">שם מלא</span>
              <span className="font-medium text-gray-900">{profile.full_name}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">שם משתמש</span>
              <span className="font-mono text-gray-900 dir-ltr" dir="ltr">{profile.username}</span>
            </div>
            {profile.email && !profile.email.endsWith('@safedoc.local') && (
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">מייל</span>
                <span className="font-mono text-gray-900 text-xs" dir="ltr">{profile.email}</span>
              </div>
            )}
            <div className="flex justify-between gap-2 pt-0.5 border-t border-gray-200">
              <span className="text-gray-500">קישור כניסה</span>
              <span className="text-xs text-gray-400 font-mono truncate max-w-[160px]" dir="ltr">{loginUrl}</span>
            </div>
          </div>

          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            הסיסמה הראשונית הוזנה בטופס — העבר אותה למשתמש בנפרד ובצינור מאובטח.
          </p>

          {/* Copy actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => copyText(loginUrl, setCopyLinkDone)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              {copyLinkDone ? (
                <svg className="w-4 h-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
              {copyLinkDone ? 'הועתק!' : 'העתק קישור'}
            </button>
            <button
              onClick={() => copyText(inviteMsg, setCopyMsgDone)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              {copyMsgDone ? (
                <svg className="w-4 h-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              )}
              {copyMsgDone ? 'הועתק!' : 'העתק הודעה'}
            </button>
          </div>

          {/* WhatsApp / native share */}
          <div className="flex gap-2">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-[#25D366] text-white hover:bg-[#20bd5a] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.558 4.122 1.528 5.855L.057 23.998l6.304-1.654A11.936 11.936 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.673-.487-5.224-1.34l-.374-.219-3.741.981.999-3.648-.243-.386A9.92 9.92 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
              WhatsApp
            </a>
            {canShare && (
              <button
                onClick={() => navigator.share({ title: 'SafeDoc — פרטי כניסה', text: inviteMsg })}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                שתף
              </button>
            )}
          </div>

          <button
            onClick={() => { onAdded(createdData.member); onClose(); }}
            className="w-full bg-orange-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
          >
            סיום ← הוסף לרשימה
          </button>
        </div>
      </ModalWrapper>
    );
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
