'use client';

import { useState, useMemo } from 'react';
import type { CompanyRole } from '@/types';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

// ─── Public types (exported for page.tsx and tests) ───────────────

export interface CompanyInfo {
  id:        string;
  name:      string;
  slug:      string | null;
  logo_url:  string | null;
  is_active: boolean;
}

export interface Membership {
  id:        string;
  role:      CompanyRole;
  is_active: boolean;
  joined_at: string;
  company:   CompanyInfo | null;
}

export interface UserWithMemberships {
  id:           string;
  full_name:    string;
  username:     string | null;
  email:        string;
  role:         'admin' | 'user';
  is_active:    boolean;
  job_title:    string | null;
  report_email: string | null;
  created_at:   string;
  memberships:  Membership[];
}

// ─── Label maps ───────────────────────────────────────────────────

const PLATFORM_ROLE_LABELS: Record<string, string> = {
  admin: 'מנהל פלטפורמה',
  user:  'משתמש רגיל',
};

const PLATFORM_ROLE_CHIP: Record<string, string> = {
  admin: 'bg-orange-100 text-orange-700 border-orange-200',
  user:  'bg-blue-50 text-blue-700 border-blue-200',
};

const COMPANY_ROLE_LABELS: Record<CompanyRole, string> = {
  owner:  'בעלים',
  admin:  'מנהל חברה',
  member: 'משתמש חברה',
};

const COMPANY_ROLE_CHIP: Record<CompanyRole, string> = {
  owner:  'bg-purple-100 text-purple-700 border-purple-200',
  admin:  'bg-orange-100 text-orange-700 border-orange-200',
  member: 'bg-gray-50 text-gray-600 border-gray-200',
};

// ─── Pure grouping utilities (exported for tests) ─────────────────

export function getActiveCompanyMemberships(u: UserWithMemberships): Membership[] {
  return u.memberships.filter(m => m.is_active && m.company?.is_active === true);
}

export function collectCompanies(users: UserWithMemberships[]): CompanyInfo[] {
  const map = new Map<string, CompanyInfo>();
  for (const user of users) {
    for (const m of getActiveCompanyMemberships(user)) {
      if (m.company && !map.has(m.company.id)) {
        map.set(m.company.id, m.company);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export function usersForCompany(users: UserWithMemberships[], companyId: string): UserWithMemberships[] {
  return users.filter(u => getActiveCompanyMemberships(u).some(m => m.company?.id === companyId));
}

export function usersWithNoActiveCompany(users: UserWithMemberships[]): UserWithMemberships[] {
  return users.filter(u => getActiveCompanyMemberships(u).length === 0);
}

export function usersWithMultipleCompanies(users: UserWithMemberships[]): UserWithMemberships[] {
  return users.filter(u => getActiveCompanyMemberships(u).length > 1);
}

export function applyFilters(
  users: UserWithMemberships[],
  opts: {
    search:          string;
    accountStatus:   'all' | 'active' | 'inactive';
    platformRole:    'all' | 'admin' | 'user';
    membershipRole:  'all' | CompanyRole;
    multiCompanyOnly: boolean;
  },
): UserWithMemberships[] {
  return users.filter(u => {
    if (opts.accountStatus === 'active'   && !u.is_active) return false;
    if (opts.accountStatus === 'inactive' &&  u.is_active) return false;
    if (opts.platformRole !== 'all' && u.role !== opts.platformRole) return false;
    if (opts.multiCompanyOnly && getActiveCompanyMemberships(u).length <= 1) return false;
    if (opts.membershipRole !== 'all' && !u.memberships.some(m => m.role === opts.membershipRole)) return false;
    if (opts.search) {
      const q = opts.search.toLowerCase();
      if (
        !u.full_name.toLowerCase().includes(q) &&
        !(u.email ?? '').toLowerCase().includes(q) &&
        !(u.username ?? '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });
}

// ─── Shared style ─────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-white';
const selectCls = 'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-white';

// ─── Company avatar ───────────────────────────────────────────────

function CompanyAvatar({ company, size = 'md' }: { company: CompanyInfo; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base';
  if (company.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={company.logo_url.startsWith('/') || company.logo_url.startsWith('http') ? company.logo_url : `/${company.logo_url}`}
        alt=""
        className={`${dim} rounded-lg object-contain shrink-0 border border-gray-100`}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return (
    <div className={`${dim} rounded-lg bg-orange-100 flex items-center justify-center shrink-0`}>
      <span className="font-bold text-orange-600 leading-none">{company.name.charAt(0)}</span>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${highlight && value > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-200'}`}>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────

function SectionHeader({ children, count, collapsible, collapsed, onToggle }: {
  children: React.ReactNode;
  count: number;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
      {children}
      <span className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full shrink-0">
        {count}
      </span>
      {collapsible && (
        <button
          onClick={onToggle}
          className="mr-auto text-gray-400 hover:text-gray-600 text-xs px-2 py-1"
        >
          {collapsed ? '▼ הצג' : '▲ כווץ'}
        </button>
      )}
    </div>
  );
}

// ─── User table (shared across sections) ─────────────────────────

function UserTable({
  users,
  getCompanyRole,
  onEdit,
  onReset,
  onToggle,
  showMemberships = false,
}: {
  users: UserWithMemberships[];
  getCompanyRole?: (u: UserWithMemberships) => CompanyRole | undefined;
  onEdit:   (u: UserWithMemberships) => void;
  onReset:  (u: UserWithMemberships) => void;
  onToggle: (updated: UserWithMemberships) => void;
  showMemberships?: boolean;
}) {
  if (users.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p className="text-sm">לא נמצאו משתמשים</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">שם מלא</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap hidden md:table-cell">שם משתמש</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap hidden lg:table-cell">מייל</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">הרשאת פלטפורמה</th>
            {getCompanyRole && (
              <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">תפקיד בחברה</th>
            )}
            {showMemberships && (
              <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">חברות</th>
            )}
            <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">חשבון</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {users.map(u => (
            <UserRow
              key={u.id}
              user={u}
              companyRole={getCompanyRole?.(u)}
              showMemberships={showMemberships}
              onEdit={() => onEdit(u)}
              onReset={() => onReset(u)}
              onToggle={onToggle}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── User row ─────────────────────────────────────────────────────

function UserRow({
  user: u,
  companyRole,
  showMemberships,
  onEdit,
  onReset,
  onToggle,
}: {
  user: UserWithMemberships;
  companyRole?: CompanyRole;
  showMemberships?: boolean;
  onEdit:   () => void;
  onReset:  () => void;
  onToggle: (updated: UserWithMemberships) => void;
}) {
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    if (!confirm(`${u.is_active ? 'להשבית' : 'להפעיל מחדש'} את ${u.full_name}?`)) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      if (res.ok) {
        const data = await res.json();
        onToggle({ ...u, ...data });
      }
    } finally {
      setToggling(false);
    }
  }

  const activeCompanyMemberships = getActiveCompanyMemberships(u);

  return (
    <tr className={`hover:bg-gray-50 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900 whitespace-nowrap">{u.full_name}</p>
        {u.job_title && <p className="text-xs text-gray-400 mt-0.5">{u.job_title}</p>}
      </td>
      <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap hidden md:table-cell">
        {u.username ?? '—'}
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
        {u.email}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PLATFORM_ROLE_CHIP[u.role]}`}>
          {PLATFORM_ROLE_LABELS[u.role]}
        </span>
      </td>
      {companyRole !== undefined && (
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${COMPANY_ROLE_CHIP[companyRole]}`}>
            {COMPANY_ROLE_LABELS[companyRole]}
          </span>
        </td>
      )}
      {showMemberships && (
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {activeCompanyMemberships.map(m => (
              <span key={m.id} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full border border-gray-200">
                <span>{m.company?.name ?? '—'}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500">{COMPANY_ROLE_LABELS[m.role]}</span>
              </span>
            ))}
          </div>
        </td>
      )}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.is_active ? 'text-green-600' : 'text-gray-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
          {u.is_active ? 'פעיל' : 'מושבת'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          <button onClick={onEdit}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap">
            עריכה
          </button>
          <button onClick={onReset}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap">
            אפס סיסמה
          </button>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`text-xs px-2 py-1 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 ${
              u.is_active
                ? 'text-red-500 hover:text-red-600 hover:bg-red-50'
                : 'text-green-600 hover:text-green-700 hover:bg-green-50'
            }`}
          >
            {toggling ? '...' : u.is_active ? 'השבת' : 'הפעל'}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Company section ──────────────────────────────────────────────

function CompanySection({ company, users, onEdit, onReset, onToggle }: {
  company: CompanyInfo;
  users:   UserWithMemberships[];
  onEdit:  (u: UserWithMemberships) => void;
  onReset: (u: UserWithMemberships) => void;
  onToggle: (updated: UserWithMemberships) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <SectionHeader count={users.length} collapsible collapsed={collapsed} onToggle={() => setCollapsed(c => !c)}>
        <CompanyAvatar company={company} size="sm" />
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{company.name}</p>
          {company.slug && <p className="text-xs text-gray-400 font-mono">{company.slug}</p>}
        </div>
      </SectionHeader>
      {!collapsed && (
        <UserTable
          users={users}
          getCompanyRole={u => getActiveCompanyMemberships(u).find(m => m.company?.id === company.id)?.role}
          onEdit={onEdit}
          onReset={onReset}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}

// ─── No-company section ───────────────────────────────────────────

function NoCompanySection({ users, onEdit, onReset, onToggle }: {
  users:    UserWithMemberships[];
  onEdit:   (u: UserWithMemberships) => void;
  onReset:  (u: UserWithMemberships) => void;
  onToggle: (updated: UserWithMemberships) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-dashed border-gray-300 overflow-hidden">
      <SectionHeader count={users.length} collapsible collapsed={collapsed} onToggle={() => setCollapsed(c => !c)}>
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <span className="text-gray-400 text-sm">—</span>
        </div>
        <p className="font-semibold text-gray-600">משתמשים ללא חברה</p>
      </SectionHeader>
      {!collapsed && (
        <UserTable users={users} onEdit={onEdit} onReset={onReset} onToggle={onToggle} />
      )}
    </div>
  );
}

// ─── Multi-company section ────────────────────────────────────────

function MultiCompanySection({ users, onEdit, onReset, onToggle }: {
  users:    UserWithMemberships[];
  onEdit:   (u: UserWithMemberships) => void;
  onReset:  (u: UserWithMemberships) => void;
  onToggle: (updated: UserWithMemberships) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
      <SectionHeader count={users.length} collapsible collapsed={collapsed} onToggle={() => setCollapsed(c => !c)}>
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <span className="text-blue-500 text-sm font-bold">2+</span>
        </div>
        <p className="font-semibold text-gray-900">משתמשים במספר חברות</p>
      </SectionHeader>
      {!collapsed && (
        <UserTable
          users={users}
          onEdit={onEdit}
          onReset={onReset}
          onToggle={onToggle}
          showMemberships
        />
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────

interface Props {
  initialUsers: UserWithMemberships[];
}

type Modal = 'edit' | 'reset-password' | null;

export default function UserManagementClient({ initialUsers }: Props) {
  const [users, setUsers] = useState<UserWithMemberships[]>(initialUsers);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedUser, setSelectedUser] = useState<UserWithMemberships | null>(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportMsg, setReportMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);

  // Filters
  const [search, setSearch]               = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [accountStatus, setAccountStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [platformRole, setPlatformRole]   = useState<'all' | 'admin' | 'user'>('all');
  const [membershipRole, setMembershipRole] = useState<'all' | CompanyRole>('all');
  const [multiCompanyOnly, setMultiCompanyOnly] = useState(false);

  // Derived: all companies (from full user set)
  const companies = useMemo(() => collectCompanies(users), [users]);

  // Summary stats (full, unfiltered)
  const stats = useMemo(() => ({
    total:       users.length,
    active:      users.filter(u => u.is_active).length,
    companies:   companies.length,
    noMembership: usersWithNoActiveCompany(users).length,
    multiCompany: usersWithMultipleCompanies(users).length,
  }), [users, companies]);

  // Filtered users (company scoping is applied by rendering only visibleCompanies sections)
  const filtered = useMemo(() => applyFilters(users, {
    search, accountStatus, platformRole, membershipRole, multiCompanyOnly,
  }), [users, search, accountStatus, platformRole, membershipRole, multiCompanyOnly]);

  // Which companies to render
  const visibleCompanies = companyFilter === 'all'
    ? companies
    : companies.filter(c => c.id === companyFilter);

  const showSpecialSections = companyFilter === 'all';

  const reportRecipients = users.filter(u => u.role === 'admin' && u.is_active && !!u.report_email).length;

  function openEdit(u: UserWithMemberships)  { setSelectedUser(u); setModal('edit'); }
  function openReset(u: UserWithMemberships) { setSelectedUser(u); setModal('reset-password'); }
  function closeModal() { setModal(null); setSelectedUser(null); }

  function handleUpdated(data: Record<string, unknown>) {
    setUsers(prev => prev.map(u => u.id === data.id ? { ...u, ...data } : u));
    closeModal();
  }

  function handleToggled(updated: UserWithMemberships) {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
  }

  async function sendTestReport() {
    if (!confirm('לשלוח דוח בדיקה לכל האדמינים עם מייל לדוחות?')) return;
    setSendingReport(true);
    setReportMsg(null);
    try {
      const res  = await fetch('/api/reports/weekly-status', { method: 'POST' });
      const data = await res.json();
      if (!res.ok && data.error && !data.recipients) {
        setReportMsg({ ok: false, lines: [data.error] });
        return;
      }
      const lines: string[] = [];
      if (data.sent_count > 0) lines.push(`נשלח ל-${data.sent_count} נמענים: ${(data.recipients as string[]).join(', ')}`);
      if (data.resend_id)      lines.push(`Resend ID: ${data.resend_id}`);
      if (data.failed_count > 0) lines.push(`נכשל עבור ${data.failed_count} נמענים`);
      if (data.errors?.length)   lines.push(...(data.errors as string[]));
      if (data.sent_count === 0 && !data.errors?.length) lines.push('לא נמצאו נמענים');
      setReportMsg({ ok: data.sent_count > 0 && !data.failed_count && !data.errors?.length, lines });
    } catch {
      setReportMsg({ ok: false, lines: ['שגיאת תקשורת'] });
    } finally {
      setSendingReport(false);
    }
  }

  return (
    <div className="space-y-5" dir="rtl">

      {/* ─── Page header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">משתמשי הפלטפורמה</h1>
          <p className="text-sm text-gray-500 mt-0.5">ניהול חשבונות ושיוכי חברה · מוצג לפי חברה</p>
        </div>
        <button
          onClick={sendTestReport}
          disabled={sendingReport || reportRecipients === 0}
          title={reportRecipients === 0 ? 'אין אדמינים עם מייל לדוחות' : ''}
          className="flex items-center gap-1.5 border border-gray-200 bg-white text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          <span className="text-base leading-none">📧</span>
          {sendingReport ? 'שולח...' : 'שלח דוח בדיקה'}
        </button>
      </div>

      {reportMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm ${reportMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              {reportMsg.lines.map((line, i) => <p key={i} className={i === 0 ? 'font-medium' : 'text-xs opacity-80'}>{line}</p>)}
            </div>
            <button onClick={() => setReportMsg(null)} className="text-xs opacity-40 hover:opacity-70 shrink-0">✕</button>
          </div>
        </div>
      )}

      {/* ─── Summary stats ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="חשבונות פלטפורמה" value={stats.total} />
        <StatCard label="חשבונות פעילים"   value={stats.active} />
        <StatCard label="חברות"             value={stats.companies} />
        <StatCard label="ללא חברה פעילה"   value={stats.noMembership} highlight />
        <StatCard label="מספר חברות"        value={stats.multiCompany} />
      </div>

      {/* ─── Filters ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            placeholder="חיפוש שם, מייל, שם משתמש..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${inputCls} max-w-xs`}
          />
          <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className={selectCls}>
            <option value="all">כל החברות</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={accountStatus} onChange={e => setAccountStatus(e.target.value as 'all' | 'active' | 'inactive')} className={selectCls}>
            <option value="all">כל הסטטוסים</option>
            <option value="active">פעיל</option>
            <option value="inactive">מושבת</option>
          </select>
          <select value={platformRole} onChange={e => setPlatformRole(e.target.value as 'all' | 'admin' | 'user')} className={selectCls}>
            <option value="all">כל ההרשאות</option>
            <option value="admin">מנהל פלטפורמה</option>
            <option value="user">משתמש רגיל</option>
          </select>
          <select value={membershipRole} onChange={e => setMembershipRole(e.target.value as 'all' | CompanyRole)} className={selectCls}>
            <option value="all">כל תפקידי החברה</option>
            <option value="owner">בעלים</option>
            <option value="admin">מנהל חברה</option>
            <option value="member">משתמש חברה</option>
          </select>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 py-2">
            <input
              type="checkbox"
              checked={multiCompanyOnly}
              onChange={e => setMultiCompanyOnly(e.target.checked)}
              className="accent-orange-500"
            />
            מספר חברות בלבד
          </label>
        </div>
        <p className="text-xs text-gray-400 mt-2">{filtered.length} משתמשים תואמים</p>
      </div>

      {/* ─── Company sections ──────────────────────────────────────── */}
      {visibleCompanies.length === 0 && !showSpecialSections && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">לא נמצאו חברות תואמות</p>
        </div>
      )}
      {visibleCompanies.map(company => (
        <CompanySection
          key={company.id}
          company={company}
          users={usersForCompany(filtered, company.id)}
          onEdit={openEdit}
          onReset={openReset}
          onToggle={handleToggled}
        />
      ))}

      {/* ─── Special sections (only when "all companies") ─────────── */}
      {showSpecialSections && (
        <>
          <NoCompanySection
            users={usersWithNoActiveCompany(filtered)}
            onEdit={openEdit}
            onReset={openReset}
            onToggle={handleToggled}
          />
          <MultiCompanySection
            users={usersWithMultipleCompanies(filtered)}
            onEdit={openEdit}
            onReset={openReset}
            onToggle={handleToggled}
          />
        </>
      )}

      {/* ─── Modals ───────────────────────────────────────────────── */}
      {modal === 'edit' && selectedUser && (
        <EditUserModal user={selectedUser} onClose={closeModal} onUpdated={handleUpdated} />
      )}
      {modal === 'reset-password' && selectedUser && (
        <ResetPasswordModal user={selectedUser} onClose={closeModal} />
      )}
    </div>
  );
}

// ─── Edit user modal ──────────────────────────────────────────────

function EditUserModal({
  user,
  onClose,
  onUpdated,
}: {
  user:      UserWithMemberships;
  onClose:   () => void;
  onUpdated: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    full_name:    user.full_name,
    role:         user.role,
    job_title:    user.job_title    ?? '',
    report_email: user.report_email ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/users/${user.id}`, {
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
    <ModalWrapper title={`עריכת ${user.full_name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא *</label>
          <input type="text" required value={form.full_name} onChange={e => set('full_name', e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הרשאת פלטפורמה *</label>
            <select value={form.role} onChange={e => set('role', e.target.value)} className={inputCls}>
              <option value="user">משתמש רגיל</option>
              <option value="admin">מנהל פלטפורמה</option>
            </select>
            <p className="text-xs text-orange-600 mt-1">שינוי זה משפיע על גישת הפלטפורמה, לא על תפקיד בחברה</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד עסקי</label>
            <input type="text" value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="מנהל בטיחות" className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">מייל לדוחות שבועיים</label>
          <input type="email" value={form.report_email} onChange={e => set('report_email', e.target.value)}
            placeholder="admin@company.com" dir="ltr" className={inputCls} />
          <p className="text-xs text-gray-400 mt-1">
            {form.role === 'admin' ? 'אדמין פעיל עם מייל זה יקבל דוחות שבועיים' : 'רק מנהלי פלטפורמה מקבלים דוחות שבועיים'}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
          <p><span className="font-medium">שם משתמש:</span> {user.username ?? '—'}</p>
          <p><span className="font-medium">מייל התחברות:</span> {user.email}</p>
          <p><span className="font-medium">נוצר:</span> {format(parseISO(user.created_at), 'dd/MM/yyyy', { locale: he })}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          לשינוי תפקיד בחברה ספציפית, נווט לדף החברה → ניהול חברים
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">{error}</div>}
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
    </ModalWrapper>
  );
}

// ─── Reset password modal ─────────────────────────────────────────

function ResetPasswordModal({ user, onClose }: { user: UserWithMemberships; onClose: () => void }) {
  const [generateAuto, setGenerateAuto] = useState(true);
  const [manualPwd,    setManualPwd]    = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [revealedPwd,  setRevealedPwd]  = useState<string | null>(null);
  const [copied,       setCopied]       = useState(false);

  async function handleReset() {
    setError('');
    setLoading(true);
    try {
      const body = generateAuto ? {} : { password: manualPwd };
      const res  = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה באיפוס'); return; }
      setRevealedPwd(data.password);
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setLoading(false);
    }
  }

  async function copyPwd() {
    if (!revealedPwd) return;
    await navigator.clipboard.writeText(revealedPwd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (revealedPwd) {
    return (
      <ModalWrapper title="סיסמה חדשה" onClose={onClose}>
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
            <p className="text-xs text-orange-600 font-medium mb-2">הסיסמה מוצגת פעם אחת בלבד</p>
            <div className="flex items-center gap-2 justify-center">
              <code className="text-lg font-bold text-gray-900 tracking-widest bg-white px-4 py-2 rounded-lg border border-orange-200">
                {revealedPwd}
              </code>
              <button onClick={copyPwd} className="text-sm text-orange-500 hover:text-orange-600 px-3 py-2 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">
                {copied ? '✓ הועתק' : 'העתק'}
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500 text-center">הסיסמה הוגדרה לחשבון של <strong>{user.full_name}</strong></p>
          <button onClick={onClose} className="w-full bg-gray-900 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
            סגור
          </button>
        </div>
      </ModalWrapper>
    );
  }

  return (
    <ModalWrapper title={`איפוס סיסמה — ${user.full_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['auto', 'manual'] as const).map(mode => (
            <button key={mode} onClick={() => setGenerateAuto(mode === 'auto')}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                (mode === 'auto') === generateAuto
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {mode === 'auto' ? 'ייצור אוטומטי' : 'הגדרה ידנית'}
            </button>
          ))}
        </div>
        {generateAuto ? (
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-500 text-center">
            המערכת תייצר סיסמה אקראית חזקה ותציג אותה פעם אחת
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה חדשה</label>
            <input type="password" value={manualPwd} onChange={e => setManualPwd(e.target.value)}
              placeholder="לפחות 8 תווים" minLength={8} className={inputCls} />
          </div>
        )}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">{error}</div>}
        <div className="flex gap-2">
          <button onClick={handleReset} disabled={loading || (!generateAuto && manualPwd.length < 8)}
            className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {loading ? 'מאפס...' : 'אפס סיסמה'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50 transition-colors">
            ביטול
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────

function ModalWrapper({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
