'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ResolvedCompanySettings } from '@/lib/company/settings';
import { broadcastSessionCompaniesChanged } from '@/lib/session/SessionCompaniesProvider';

interface Props {
  companyId: string;
  companyName: string;
  initialSettings: ResolvedCompanySettings;
  initialLogoUrl: string | null;
}

export default function SettingsClient({ companyId, companyName, initialSettings, initialLogoUrl }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');

  // Logo state
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [logoSuccess, setLogoSuccess] = useState('');

  // Local draft for branding edits
  const [draft, setDraft] = useState({
    primaryColor: settings.branding.primaryColor,
    secondaryColor: settings.branding.secondaryColor,
    accentColor: settings.branding.accentColor,
    displayName: settings.branding.displayName ?? '',
  });

  const [featuresDraft, setFeaturesDraft] = useState({ ...settings.features });

  // Construct the URL used for logo preview — storage paths get a leading /
  const logoDisplayUrl = logoUrl
    ? (logoUrl.startsWith('/') || logoUrl.startsWith('http') ? logoUrl : `/${logoUrl}`)
    : null;

  async function uploadLogo(file: File) {
    setLogoUploading(true);
    setLogoError('');
    setLogoSuccess('');
    try {
      const form = new FormData();
      form.append('file', file);
      const upRes = await fetch('/api/admin/upload-logo', { method: 'POST', body: form });
      const upData = await upRes.json() as { path?: string; error?: string };
      if (!upRes.ok) {
        setLogoError(upData.error ?? 'שגיאה בהעלאת לוגו');
        return;
      }

      const storagePath = upData.path!;
      const patchRes = await fetch(`/api/admin/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: storagePath }),
      });
      if (!patchRes.ok) {
        const patchData = await patchRes.json() as { error?: string };
        setLogoError(patchData.error ?? 'שגיאה בשמירת לוגו');
        return;
      }

      setLogoUrl(storagePath);
      setLogoSuccess('לוגו עודכן!');
      setTimeout(() => setLogoSuccess(''), 3000);
      broadcastSessionCompaniesChanged();
    } catch {
      setLogoError('שגיאת תקשורת');
    } finally {
      setLogoUploading(false);
    }
  }

  async function removeLogo() {
    if (!logoUrl) return;
    setLogoUploading(true);
    setLogoError('');
    setLogoSuccess('');
    try {
      // Only attempt storage deletion for managed company-logos/ paths
      const storagePath = logoUrl.startsWith('/') ? logoUrl.slice(1) : logoUrl;
      if (storagePath.startsWith('company-logos/')) {
        await fetch(`/api/admin/upload-logo?path=${encodeURIComponent(storagePath)}`, { method: 'DELETE' });
      }

      const patchRes = await fetch(`/api/admin/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: null }),
      });
      if (!patchRes.ok) {
        const patchData = await patchRes.json() as { error?: string };
        setLogoError(patchData.error ?? 'שגיאה בהסרת לוגו');
        return;
      }

      setLogoUrl(null);
      setLogoSuccess('לוגו הוסר');
      setTimeout(() => setLogoSuccess(''), 3000);
      broadcastSessionCompaniesChanged();
    } catch {
      setLogoError('שגיאת תקשורת');
    } finally {
      setLogoUploading(false);
    }
  }

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
        const data = await res.json() as { error?: string };
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
        const data = await res.json() as { error?: string };
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
        <h2 className="font-semibold text-gray-900 mb-5">מיתוג (Branding)</h2>

        {/* ── Logo section ───────────────────────────────────────── */}
        <div className="mb-5 pb-5 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-3">לוגו חברה</p>
          <div className="flex items-start gap-4 flex-wrap">

            {/* Preview */}
            <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
              {logoDisplayUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoDisplayUrl} alt="לוגו חברה" className="w-full h-full object-contain" />
              ) : (
                <span className="text-gray-400 text-[10px] text-center leading-tight px-1">אין לוגו</span>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-2">
              <label
                className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  logoUploading
                    ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
                }`}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="sr-only"
                  disabled={logoUploading}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void uploadLogo(file);
                    e.target.value = '';
                  }}
                />
                {logoUploading ? 'מעלה...' : logoDisplayUrl ? 'החלף לוגו' : 'העלה לוגו'}
              </label>

              {logoDisplayUrl && (
                <button
                  type="button"
                  disabled={logoUploading}
                  onClick={() => void removeLogo()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  הסר לוגו
                </button>
              )}

              <p className="text-xs text-gray-400">PNG, JPG, SVG — עד 2MB</p>
            </div>

            {/* Inline status */}
            <div className="flex flex-col justify-center gap-1">
              {logoError && <p className="text-sm text-red-600">{logoError}</p>}
              {logoSuccess && <p className="text-sm text-green-600 font-medium">{logoSuccess}</p>}
            </div>
          </div>
        </div>

        {/* ── Branding form ──────────────────────────────────────── */}
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
