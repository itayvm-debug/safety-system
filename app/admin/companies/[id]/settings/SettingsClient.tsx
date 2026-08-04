'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ResolvedCompanySettings } from '@/lib/company/settings';

interface Props {
  companyId: string;
  companyName: string;
  initialSettings: ResolvedCompanySettings;
}

export default function SettingsClient({ companyId, companyName, initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');

  // Local draft for edits
  const [draft, setDraft] = useState({
    primaryColor: settings.branding.primaryColor,
    secondaryColor: settings.branding.secondaryColor,
    accentColor: settings.branding.accentColor,
    displayName: settings.branding.displayName ?? '',
  });

  const [featuresDraft, setFeaturesDraft] = useState({ ...settings.features });

  async function saveBranding(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            branding: {
              primaryColor: draft.primaryColor,
              secondaryColor: draft.secondaryColor,
              accentColor: draft.accentColor,
              ...(draft.displayName ? { displayName: draft.displayName } : {}),
            },
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'שגיאה בשמירה');
        return;
      }
      setSavedMsg('נשמר!');
      setTimeout(() => setSavedMsg(''), 2000);
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setSaving(false);
    }
  }

  async function saveFeatures() {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { features: featuresDraft } }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'שגיאה בשמירה');
        return;
      }
      setSettings(prev => ({ ...prev, features: featuresDraft }));
      setSavedMsg('נשמר!');
      setTimeout(() => setSavedMsg(''), 2000);
    } catch {
      setError('שגיאת תקשורת');
    } finally {
      setSaving(false);
    }
  }

  const FEATURE_LABELS: Record<keyof typeof featuresDraft, string> = {
    workers: 'עובדים',
    documents: 'מסמכים',
    vehicles: 'רכבים',
    heavyEquipment: 'כלי צמ"ה',
    liftingEquipment: 'ציוד הרמה',
    subcontractors: 'קבלני משנה',
    reports: 'דוחות',
    customWorkerFields: 'שדות עובד מותאמים',
    customDocumentCategories: 'קטגוריות מסמך מותאמות',
    customVehicleFields: 'שדות רכב מותאמים',
    vehicleAssignmentToWorker: 'שיוך רכב לעובד',
    vehicleAssignmentToSubcontractor: 'שיוך רכב לקבלן משנה',
  };

  return (
    <div className="space-y-6">
      <nav className="text-sm text-gray-500">
        <Link href="/admin/companies" className="hover:text-gray-700">חברות</Link>
        <span className="mx-2">/</span>
        <Link href={`/admin/companies/${companyId}`} className="hover:text-gray-700">{companyName}</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">הגדרות</span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900">הגדרות — {companyName}</h1>

      {savedMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-medium">{savedMsg}</div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {/* Branding */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">מיתוג (Branding)</h2>
        <form onSubmit={saveBranding} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם תצוגה</label>
            <input type="text" value={draft.displayName}
              onChange={e => setDraft(p => ({ ...p, displayName: e.target.value }))}
              placeholder={companyName}
              className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">צבע ראשי</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={draft.primaryColor}
                  onChange={e => setDraft(p => ({ ...p, primaryColor: e.target.value }))}
                  className="w-10 h-10 rounded border border-gray-300 cursor-pointer" />
                <input type="text" value={draft.primaryColor} dir="ltr"
                  onChange={e => setDraft(p => ({ ...p, primaryColor: e.target.value }))}
                  className={`${inputCls} flex-1 font-mono text-xs`} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">צבע משני</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={draft.secondaryColor}
                  onChange={e => setDraft(p => ({ ...p, secondaryColor: e.target.value }))}
                  className="w-10 h-10 rounded border border-gray-300 cursor-pointer" />
                <input type="text" value={draft.secondaryColor} dir="ltr"
                  onChange={e => setDraft(p => ({ ...p, secondaryColor: e.target.value }))}
                  className={`${inputCls} flex-1 font-mono text-xs`} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">צבע הדגשה</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={draft.accentColor}
                  onChange={e => setDraft(p => ({ ...p, accentColor: e.target.value }))}
                  className="w-10 h-10 rounded border border-gray-300 cursor-pointer" />
                <input type="text" value={draft.accentColor} dir="ltr"
                  onChange={e => setDraft(p => ({ ...p, accentColor: e.target.value }))}
                  className={`${inputCls} flex-1 font-mono text-xs`} />
              </div>
            </div>
          </div>
          <div className="pt-1">
            <button type="submit" disabled={saving}
              className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {saving ? 'שומר...' : 'שמור מיתוג'}
            </button>
          </div>
        </form>
      </div>

      {/* Features */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">פיצ&apos;רים (Features)</h2>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(featuresDraft) as Array<keyof typeof featuresDraft>).map(key => (
            <label key={key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={featuresDraft[key]}
                onChange={e => setFeaturesDraft(p => ({ ...p, [key]: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
              />
              <span className="text-sm text-gray-700">{FEATURE_LABELS[key]}</span>
            </label>
          ))}
        </div>
        <div className="pt-4">
          <button onClick={saveFeatures} disabled={saving}
            className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {saving ? 'שומר...' : 'שמור פיצ\'רים'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent';
