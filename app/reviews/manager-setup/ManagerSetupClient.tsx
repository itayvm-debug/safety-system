'use client';

import { useState } from 'react';
import Link from 'next/link';

type SiteManager = { id: string; full_name: string; photo_url: string | null };
type Member = {
  user_id: string;
  role: string;
  profile: { id: string; full_name: string; email: string; username: string | null } | null;
};
type Mapping = { id: string; manager_worker_id: string; user_id: string };

interface Props {
  companyId: string;
  siteManagers: SiteManager[];
  members: Member[];
  initialMappings: Mapping[];
}

export default function ManagerSetupClient({ siteManagers, members, initialMappings }: Props) {
  const [mappings, setMappings] = useState<Mapping[]>(initialMappings);
  const [pendingSelections, setPendingSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  function getMappingForManager(managerId: string): Mapping | undefined {
    return mappings.find(m => m.manager_worker_id === managerId);
  }

  function getMemberLabel(userId: string): string {
    const member = members.find(m => m.user_id === userId);
    if (!member?.profile) return userId;
    return member.profile.full_name || member.profile.email;
  }

  function getMappedUserIds(): Set<string> {
    return new Set(mappings.map(m => m.user_id));
  }

  async function saveMapping(managerId: string) {
    const userId = pendingSelections[managerId];
    if (!userId) return;
    setSaving(managerId);
    setError('');
    try {
      const res = await fetch('/api/reviews/manager-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager_worker_id: managerId, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'שגיאה בשמירה'); return; }
      setMappings(prev => [...prev, { id: data.id, manager_worker_id: managerId, user_id: userId }]);
      setPendingSelections(prev => { const n = { ...prev }; delete n[managerId]; return n; });
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setSaving(null);
    }
  }

  async function removeMapping(mappingId: string, managerId: string) {
    setSaving(managerId);
    setError('');
    try {
      const res = await fetch(`/api/reviews/manager-mappings/${mappingId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'שגיאה בהסרה');
        return;
      }
      setMappings(prev => prev.filter(m => m.id !== mappingId));
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setSaving(null);
    }
  }

  const mappedUserIds = getMappedUserIds();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/reviews" className="text-sm text-orange-600 hover:underline">← חזור</Link>
        <h1 className="text-xl font-bold text-gray-900">שיוך מנהלי אתר למשתמשים</h1>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        לכל מנהל אתר ניתן לשייך חשבון משתמש SafeDoc. המשתמש המשויך יוכל להגיש ביצועי עובדים עבור העובדים שתחתיו.
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {siteManagers.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          אין מנהלי אתר פעילים. הגדר עובד כמנהל אתר ב<Link href="/workers" className="text-orange-600 hover:underline">ניהול עובדים</Link>.
        </div>
      ) : (
        <div className="space-y-3">
          {siteManagers.map(manager => {
            const existingMapping = getMappingForManager(manager.id);
            const isSaving = saving === manager.id;

            return (
              <div key={manager.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  {manager.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={manager.photo_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                      <span className="text-orange-600 font-bold text-sm">{manager.full_name.charAt(0)}</span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{manager.full_name}</p>
                    <p className="text-xs text-gray-500">מנהל אתר</p>
                  </div>
                </div>

                {existingMapping ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm text-green-800">{getMemberLabel(existingMapping.user_id)}</span>
                    </div>
                    <button
                      onClick={() => removeMapping(existingMapping.id, manager.id)}
                      disabled={isSaving}
                      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
                    >
                      {isSaving ? 'מסיר...' : 'הסר שיוך'}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={pendingSelections[manager.id] ?? ''}
                      onChange={(e) => setPendingSelections(prev => ({ ...prev, [manager.id]: e.target.value }))}
                      disabled={isSaving}
                      className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50"
                    >
                      <option value="">— בחר משתמש —</option>
                      {members
                        .filter(m => !mappedUserIds.has(m.user_id))
                        .map(m => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.profile?.full_name || m.profile?.email || m.user_id}
                            {m.profile?.email ? ` (${m.profile.email})` : ''}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => saveMapping(manager.id)}
                      disabled={!pendingSelections[manager.id] || isSaving}
                      className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      {isSaving ? 'שומר...' : 'שייך'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
