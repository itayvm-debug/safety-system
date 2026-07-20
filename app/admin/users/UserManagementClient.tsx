'use client';

import { useState } from 'react';
import { Profile, UserRole } from '@/types';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  initialUsers: Profile[];
}

type Modal = 'create' | 'edit' | 'reset-password' | null;

function receivesReports(user: Profile): boolean {
  return user.role === 'admin' && user.is_active && !!user.report_email;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'מנהל',
  user: 'משתמש',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-orange-100 text-orange-700 border-orange-200',
  user: 'bg-blue-50 text-blue-700 border-blue-200',
};

// ─── ממשק ראשי ────────────────────────────────────────────────────
export default function UserManagementClient({ initialUsers }: Props) {
  const [users, setUsers] = useState<Profile[]>(initialUsers);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportMsg, setReportMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);

  function openEdit(user: Profile) { setSelectedUser(user); setModal('edit'); }
  function openReset(user: Profile) { setSelectedUser(user); setModal('reset-password'); }
  function closeModal() { setModal(null); setSelectedUser(null); }

  function handleCreated(p: Profile) { setUsers(prev => [...prev, p]); closeModal(); }
  function handleUpdated(p: Profile) { setUsers(prev => prev.map(u => u.id === p.id ? p : u)); closeModal(); }

  const reportRecipients = users.filter(receivesReports).length;

  async function sendTestReport() {
    if (!confirm('לשלוח דוח בדיקה לכל האדמינים עם מייל לדוחות?')) return;
    setSendingReport(true);
    setReportMsg(null);
    try {
      const res = await fetch('/api/reports/weekly-status', { method: 'POST' });
      const data = await res.json();

      // fatal error (exception before Resend was called)
      if (!res.ok && data.error && !data.recipients) {
        setReportMsg({ ok: false, lines: [data.error] });
        return;
      }

      const lines: string[] = [];

      if (data.sent_count > 0) {
        lines.push(`נשלח בהצלחה ל-${data.sent_count} נמענים: ${(data.recipients as string[]).join(', ')}`);
      }
      if (data.resend_id) {
        lines.push(`Resend message ID: ${data.resend_id}`);
      }
      if (data.failed_count > 0) {
        lines.push(`נכשל עבור ${data.failed_count} נמענים`);
      }
      if (data.errors?.length) {
        lines.push(...(data.errors as string[]).map((e: string) => `שגיאת Resend: ${e}`));
      }
      if (data.sent_count === 0 && !data.errors?.length) {
        lines.push('לא נמצאו נמענים לשליחה');
      }

      const ok = data.sent_count > 0 && data.failed_count === 0 && !data.errors?.length;
      setReportMsg({ ok, lines });
    } catch {
      setReportMsg({ ok: false, lines: ['שגיאת תקשורת עם השרת'] });
    } finally {
      setSendingReport(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ניהול משתמשים</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {users.length} משתמשים
            {reportRecipients > 0 && (
              <span className="text-green-600"> · {reportRecipients} מקבלים דוחות שבועיים</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={sendTestReport}
            disabled={sendingReport || reportRecipients === 0}
            title={reportRecipients === 0 ? 'אין אדמינים עם מייל לדוחות' : 'שלח דוח בדיקה לכל האדמינים עם מייל לדוחות'}
            className="flex items-center gap-1.5 border border-gray-200 bg-white text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <span className="text-base leading-none">📧</span>
            {sendingReport ? 'שולח...' : 'שלח דוח בדיקה'}
          </button>
          <button
            onClick={() => setModal('create')}
            className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            צור משתמש
          </button>
        </div>
      </div>

      {reportMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm ${reportMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              {reportMsg.lines.map((line, i) => (
                <p key={i} className={i === 0 ? 'font-medium' : 'text-xs opacity-80 font-mono'}>{line}</p>
              ))}
            </div>
            <button onClick={() => setReportMsg(null)} className="text-xs opacity-40 hover:opacity-70 shrink-0 mt-0.5">✕</button>
          </div>
        </div>
      )}

      {/* טבלת משתמשים */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {users.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">👤</p>
            <p className="font-medium">אין משתמשים עדיין</p>
            <p className="text-sm mt-1">לחץ &quot;צור משתמש&quot; כדי להוסיף את הראשון</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">שם מלא</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">שם משתמש</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap hidden md:table-cell">מייל</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap hidden sm:table-cell">תפקיד</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">הרשאה</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">סטטוס</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap hidden xl:table-cell">מייל לדוחות</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap hidden lg:table-cell">נוצר</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(user => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onEdit={() => openEdit(user)}
                    onReset={() => openReset(user)}
                    onToggleActive={(updated) => handleUpdated(updated)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* מודלים */}
      {modal === 'create' && (
        <CreateUserModal onClose={closeModal} onCreated={handleCreated} />
      )}
      {modal === 'edit' && selectedUser && (
        <EditUserModal user={selectedUser} onClose={closeModal} onUpdated={handleUpdated} />
      )}
      {modal === 'reset-password' && selectedUser && (
        <ResetPasswordModal user={selectedUser} onClose={closeModal} />
      )}
    </div>
  );
}

// ─── שורת משתמש ───────────────────────────────────────────────────
function UserRow({
  user,
  onEdit,
  onReset,
  onToggleActive,
}: {
  user: Profile;
  onEdit: () => void;
  onReset: () => void;
  onToggleActive: (updated: Profile) => void;
}) {
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    if (!confirm(`${user.is_active ? 'להשבית' : 'להפעיל מחדש'} את ${user.full_name}?`)) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      if (res.ok) {
        const updated = await res.json();
        onToggleActive(updated);
      }
    } finally {
      setToggling(false);
    }
  }

  return (
    <tr className={`hover:bg-gray-50 transition-colors ${!user.is_active ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{user.full_name}</td>
      <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">
        {user.username ?? '—'}
      </td>
      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
        <span className="text-xs">{user.email}</span>
      </td>
      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell whitespace-nowrap">
        {user.job_title ?? '—'}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[user.role]}`}>
          {ROLE_LABELS[user.role]}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${user.is_active ? 'text-green-600' : 'text-gray-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
          {user.is_active ? 'פעיל' : 'מושבת'}
        </span>
      </td>
      <td className="px-4 py-3 hidden xl:table-cell">
        {user.report_email ? (
          <div>
            <span className="text-xs text-gray-500 font-mono">{user.report_email}</span>
            {receivesReports(user) && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-green-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                מקבל דוחות
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap hidden lg:table-cell">
        {format(parseISO(user.created_at), 'dd/MM/yyyy', { locale: he })}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={onEdit}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap"
          >
            עריכה
          </button>
          <button
            onClick={onReset}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap"
          >
            אפס סיסמה
          </button>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`text-xs px-2 py-1 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 ${
              user.is_active
                ? 'text-red-500 hover:text-red-600 hover:bg-red-50'
                : 'text-green-600 hover:text-green-700 hover:bg-green-50'
            }`}
          >
            {toggling ? '...' : user.is_active ? 'השבת' : 'הפעל'}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── מודל יצירת משתמש ─────────────────────────────────────────────
function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Profile) => void;
}) {
  const [form, setForm] = useState({
    full_name: '',
    username: '',
    email: '',
    password: '',
    role: 'user' as UserRole,
    job_title: '',
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
      const res = await fetch('/api/admin/users', {
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
    <ModalWrapper title="צור משתמש חדש" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="שם מלא *">
          <input type="text" required value={form.full_name} onChange={e => set('full_name', e.target.value)}
            placeholder="ישראל ישראלי"
            className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="שם משתמש *">
            <input type="text" required value={form.username} onChange={e => set('username', e.target.value)}
              placeholder="israel-israeli"
              autoCapitalize="none" autoCorrect="off" dir="ltr"
              className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">הכניסה תהיה עם שם זה</p>
          </Field>
          <Field label="הרשאה *">
            <select value={form.role} onChange={e => set('role', e.target.value as UserRole)} className={inputCls}>
              <option value="user">משתמש</option>
              <option value="admin">מנהל (admin)</option>
            </select>
          </Field>
        </div>

        <Field label="מייל (אופציונלי)">
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
            placeholder={form.username ? `${form.username.toLowerCase()}@safedoc.local` : 'mail@example.com'}
            dir="ltr"
            className={inputCls} />
          <p className="text-xs text-gray-400 mt-1">אם ריק, ייווצר מייל פנימי אוטומטי</p>
        </Field>

        <Field label="תפקיד עסקי">
          <input type="text" value={form.job_title} onChange={e => set('job_title', e.target.value)}
            placeholder="מנהל בטיחות"
            className={inputCls} />
        </Field>

        <Field label="סיסמה ראשונית *">
          <input type="password" required minLength={8} value={form.password} onChange={e => set('password', e.target.value)}
            placeholder="לפחות 8 תווים"
            className={inputCls} />
        </Field>

        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={loading}
            className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {loading ? 'יוצר...' : 'צור משתמש'}
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

// ─── מודל עריכת משתמש ─────────────────────────────────────────────
function EditUserModal({
  user,
  onClose,
  onUpdated,
}: {
  user: Profile;
  onClose: () => void;
  onUpdated: (p: Profile) => void;
}) {
  const [form, setForm] = useState({
    full_name: user.full_name,
    role: user.role,
    job_title: user.job_title ?? '',
    report_email: user.report_email ?? '',
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
      const res = await fetch(`/api/admin/users/${user.id}`, {
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
        <Field label="שם מלא *">
          <input type="text" required value={form.full_name} onChange={e => set('full_name', e.target.value)}
            className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="הרשאה *">
            <select value={form.role} onChange={e => set('role', e.target.value)} className={inputCls}>
              <option value="user">משתמש</option>
              <option value="admin">מנהל (admin)</option>
            </select>
          </Field>
          <Field label="תפקיד עסקי">
            <input type="text" value={form.job_title} onChange={e => set('job_title', e.target.value)}
              placeholder="מנהל בטיחות"
              className={inputCls} />
          </Field>
        </div>

        <Field label="מייל לדוחות שבועיים">
          <input type="email" value={form.report_email} onChange={e => set('report_email', e.target.value)}
            placeholder="admin@yourcompany.com"
            dir="ltr"
            className={inputCls} />
          <p className="text-xs text-gray-400 mt-1">
            {form.role === 'admin'
              ? 'אדמין פעיל עם מייל זה יקבל דוחות שבועיים'
              : 'רק אדמינים מקבלים דוחות שבועיים'}
          </p>
        </Field>

        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
          <p><span className="font-medium">שם משתמש:</span> {user.username ?? '—'}</p>
          <p><span className="font-medium">מייל התחברות:</span> {user.email}</p>
        </div>

        {error && <ErrorBox>{error}</ErrorBox>}

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

// ─── מודל איפוס סיסמה ─────────────────────────────────────────────
function ResetPasswordModal({
  user,
  onClose,
}: {
  user: Profile;
  onClose: () => void;
}) {
  const [generateAuto, setGenerateAuto] = useState(true);
  const [manualPwd, setManualPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revealedPwd, setRevealedPwd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleReset() {
    setError('');
    setLoading(true);
    try {
      const body = generateAuto ? {} : { password: manualPwd };
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
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
            <p className="text-xs text-orange-600 font-medium mb-2">הסיסמה מוצגת פעם אחת בלבד — יש להעתיק ולמסור למשתמש</p>
            <div className="flex items-center gap-2 justify-center">
              <code className="text-lg font-bold text-gray-900 tracking-widest bg-white px-4 py-2 rounded-lg border border-orange-200">
                {revealedPwd}
              </code>
              <button onClick={copyPwd}
                className="text-sm text-orange-500 hover:text-orange-600 px-3 py-2 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">
                {copied ? '✓ הועתק' : 'העתק'}
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500 text-center">
            הסיסמה הוגדרה בהצלחה עבור <strong>{user.full_name}</strong>
          </p>
          <button onClick={onClose}
            className="w-full bg-gray-900 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
            סגור (הסיסמה תיעלם)
          </button>
        </div>
      </ModalWrapper>
    );
  }

  return (
    <ModalWrapper title={`איפוס סיסמה — ${user.full_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            onClick={() => setGenerateAuto(true)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
              generateAuto ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            ייצור אוטומטי
          </button>
          <button
            onClick={() => setGenerateAuto(false)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
              !generateAuto ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            הגדרה ידנית
          </button>
        </div>

        {generateAuto ? (
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-500 text-center">
            המערכת תייצר סיסמה אקראית חזקה ותציג אותה פעם אחת
          </div>
        ) : (
          <Field label="סיסמה חדשה">
            <input
              type="password"
              value={manualPwd}
              onChange={e => setManualPwd(e.target.value)}
              placeholder="לפחות 8 תווים"
              minLength={8}
              className={inputCls}
            />
          </Field>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={loading || (!generateAuto && manualPwd.length < 8)}
            className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {loading ? 'מאפס...' : 'אפס סיסמה'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50 transition-colors">
            ביטול
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// ─── components עזר ───────────────────────────────────────────────
function ModalWrapper({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent';
