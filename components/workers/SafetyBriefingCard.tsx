'use client';

import { useState } from 'react';
import TemplateViewer from '@/components/documents/TemplateViewer';
import SignaturePad from '@/components/documents/SignaturePad';
import { fetchBriefingTemplateUrl, saveSystemBriefing } from '@/lib/briefings/system-briefing';
import FileUploadZone from '@/components/FileUploadZone';
import {
  SafetyBriefing,
  BriefingLanguage,
  BRIEFING_LANGUAGE_LABELS,
  WorkerWithDocuments,
} from '@/types';
import { getBriefingStatus, getLatestCompletedSafetyBriefing } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  worker: WorkerWithDocuments;
  briefings: SafetyBriefing[];
  onBriefingsChange: (briefings: SafetyBriefing[]) => void;
}

type Mode = null | 'system' | 'external';

export default function SafetyBriefingCard({ worker, briefings, onBriefingsChange }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const latestBriefing = getLatestCompletedSafetyBriefing(briefings);

  const status = getBriefingStatus(latestBriefing);

  async function handleDelete(id: string) {
    setDeleting(true);
    setDeleteError('');
    const res = await fetch('/api/safety-briefings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ briefing_id: id }),
    });
    if (res.ok) {
      onBriefingsChange(briefings.filter((b) => b.id !== id));
      setConfirmDelete(false);
    } else {
      setDeleteError('שגיאה במחיקה');
    }
    setDeleting(false);
  }

  function close() { setFormOpen(false); setMode(null); }

  return (
    <>
    {previewUrl && <DocumentPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">תדריך בטיחות</h3>
        <StatusBadge status={status} size="sm" />
      </div>

      {latestBriefing ? (
        <div className="text-sm text-gray-500 mb-3 space-y-0.5">
          <p>בוצע: {format(parseISO(latestBriefing.briefed_at), 'dd/MM/yyyy', { locale: he })}</p>
          <p>תוקף עד: {format(parseISO(latestBriefing.expires_at), 'dd/MM/yyyy', { locale: he })}</p>
          {latestBriefing.conducted_by && <p>מדריך: {latestBriefing.conducted_by}</p>}
          {latestBriefing.language && <p>שפה: {BRIEFING_LANGUAGE_LABELS[latestBriefing.language]}</p>}
          <div className="flex gap-3 mt-1 flex-wrap items-center">
            {latestBriefing.file_url && (
              <>
                <FileActionButton fileUrl={latestBriefing.file_url} download={false} label="צפה ב-PDF" onPreview={setPreviewUrl} />
                <FileActionButton fileUrl={latestBriefing.file_url} download={true} label="הורד PDF" />
              </>
            )}
            {confirmDelete ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-gray-600">למחוק את רשומת התדריך?</span>
                <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="text-gray-500 hover:text-gray-700">ביטול</button>
                <button onClick={() => handleDelete(latestBriefing.id)} disabled={deleting} className="text-red-600 font-medium hover:text-red-800 disabled:opacity-50">
                  {deleting ? 'מוחק...' : 'מחק'}
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-400 hover:text-red-600">
                מחק רשומה
              </button>
            )}
          </div>
          {deleteError && <p className="text-xs text-red-600 mt-1">{deleteError}</p>}
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-3">טרם בוצע תדריך בטיחות</p>
      )}

      {!formOpen ? (
        <button
          onClick={() => setFormOpen(true)}
          className="text-sm text-orange-500 hover:text-orange-600 border border-orange-200 rounded-lg px-3 py-1.5 hover:bg-orange-50 transition-colors"
        >
          {latestBriefing ? 'עדכן תדריך' : 'בצע תדריך'}
        </button>
      ) : !mode ? (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
          <p className="text-sm font-medium text-gray-700">בחר אופן ביצוע:</p>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('system')}
              className="flex-1 py-2.5 border-2 border-orange-200 rounded-xl text-sm font-medium text-orange-600 hover:bg-orange-50"
            >
              תדריך מהמערכת
            </button>
            <button
              onClick={() => setMode('external')}
              className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              העלאת תדריך קיים
            </button>
          </div>
          <button onClick={close} className="text-xs text-gray-400 hover:text-gray-600">ביטול</button>
        </div>
      ) : mode === 'system' ? (
        <SystemBriefingFlow worker={worker} onClose={close} onSaved={(b) => { onBriefingsChange([b, ...briefings]); close(); }} />
      ) : (
        <ExternalModeForm workerId={worker.id} onClose={close} onSaved={(b) => { onBriefingsChange([b, ...briefings]); close(); }} />
      )}
    </div>
    </>
  );
}

// ─── תדריך מהמערכת ─────────────────────────────────────────────
type FlowStep = 'language' | 'briefing' | 'sign';

function SystemBriefingFlow({
  worker,
  onClose,
  onSaved,
}: {
  worker: WorkerWithDocuments;
  onClose: () => void;
  onSaved: (briefing: SafetyBriefing) => void;
}) {
  const [step, setStep] = useState<FlowStep>('language');
  const [language, setLanguage] = useState<BriefingLanguage | ''>('');
  const [conductedBy, setConductedBy] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [error, setError] = useState('');
  const [resolvedTemplateUrl, setResolvedTemplateUrl] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);

  const missingFields = [
    !language && 'יש לבחור שפה',
    !conductedBy.trim() && 'יש להזין שם המדריך',
    !signatureDataUrl && 'יש לחתום ולאשר את החתימה',
  ].filter(Boolean) as string[];

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  async function resolveTemplateAndAdvance() {
    if (!language) { setError('יש לבחור שפה'); return; }
    if (!conductedBy.trim()) { setError('יש להזין שם מבצע'); return; }
    setError('');
    setTemplateLoading(true);
    try {
      setResolvedTemplateUrl(await fetchBriefingTemplateUrl(language));
      setStep('briefing');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת תבנית התדריך');
    } finally {
      setTemplateLoading(false);
    }
  }

  async function handleFinish() {
    if (missingFields.length > 0) {
      setError(missingFields.join(' • '));
      return;
    }
    setSaving(true);
    setError('');
    try {
      onSaved(await saveSystemBriefing({
        worker,
        language: language as BriefingLanguage,
        conductedBy,
        signatureDataUrl,
        templateUrl: resolvedTemplateUrl,
      }, setSaveStatus));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      setSaveStatus('');
    }
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 space-y-4">
      {/* שלב 1: בחירת שפה */}
      {step === 'language' && (
        <>
          <p className="text-sm font-medium text-gray-700">שפת האם של העובד:</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.entries(BRIEFING_LANGUAGE_LABELS) as [BriefingLanguage, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setLanguage(key)}
                className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                  language === key
                    ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם המדריך</label>
            <input aria-label="שם המדריך"
              type="text"
              value={conductedBy}
              onChange={(e) => setConductedBy(e.target.value)}
              placeholder="שם מנהל העבודה / מנהל הבטיחות"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void resolveTemplateAndAdvance()}
              disabled={templateLoading}
              className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {templateLoading ? 'טוען...' : 'המשך לתדריך ←'}
            </button>
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">ביטול</button>
          </div>
        </>
      )}

      {/* שלב 2: הצגת PDF המקורי */}
      {step === 'briefing' && resolvedTemplateUrl && (
        <TemplateViewer title="תדריך בטיחות"
          src={resolvedTemplateUrl}
          onContinue={() => setStep('sign')}
          onBack={() => setStep('language')}
        />
      )}

      {/* שלב 3: חתימה */}
      {step === 'sign' && (
        <>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">חתימת העובד</p>
            <SignaturePad onCapture={setSignatureDataUrl} />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={handleFinish}
                disabled={missingFields.length > 0 || saving}
                className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (saveStatus || 'שומר...') : 'סיום תדריך ושמירה'}
              </button>
              <button onClick={() => setStep('briefing')} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">חזרה</button>
            </div>
            {missingFields.length > 0 && (
              <ul className="text-xs text-red-500 space-y-0.5 pr-1">
                {missingFields.map((msg) => (
                  <li key={msg}>• {msg}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── מצב ב: תדריך קיים ─────────────────────────────────────────
function ExternalModeForm({ workerId, onClose, onSaved }: { workerId: string; onClose: () => void; onSaved: (briefing: SafetyBriefing) => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [briefedAt, setBriefedAt] = useState(today);
  const [conductedBy, setConductedBy] = useState('');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!fileUrl) { setError('יש להעלות קובץ תדריך'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/safety-briefings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: workerId, mode: 'external', conducted_by: conductedBy || null, file_url: fileUrl, briefed_at: briefedAt }),
      });
      const savedBriefing = await res.json();
      if (!res.ok) { setError(savedBriefing.error); return; }
      onSaved(savedBriefing);
    } catch { setError('שגיאת תקשורת'); } finally { setSaving(false); }
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">תאריך ביצוע</label>
        <input type="date" aria-label="תאריך ביצוע התדריך" value={briefedAt} max={today} onChange={(e) => setBriefedAt(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" dir="ltr" />
        <p className="text-xs text-gray-400 mt-0.5">תוקף: שנה מתאריך ביצוע</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">מבצע התדריך (אופציונלי)</label>
        <input aria-label="מבצע התדריך (אופציונלי)" type="text" value={conductedBy} onChange={(e) => setConductedBy(e.target.value)} placeholder="שם מנהל העבודה"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">קובץ/תמונה של התדריך</label>
        <FileUploadZone
          ariaLabel="קובץ תדריך בטיחות"
          folder="documents"
          onUploaded={(path) => setFileUrl(path)}
          currentFileName={fileUrl ? 'קובץ הועלה' : undefined}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 disabled:opacity-50">
          {saving ? 'שומר...' : 'שמור תדריך'}
        </button>
        <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">ביטול</button>
      </div>
    </div>
  );
}

// ─── מודל תצוגת מסמך מובנה ──────────────────────────────────────
// Desktop (≥640px): inline iframe.  CSP includes frame-src https://*.supabase.co
//   so Supabase Storage signed URLs load correctly.
// Mobile (<640px): iOS Safari cannot render PDFs in iframes, so show a
//   prominent open-externally button instead of a blank gray rectangle.
function DocumentPreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70"
      onClick={onClose}
    >
      {/* Header — always visible */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-sm font-medium">תצוגת מסמך</span>
        <div className="flex items-center gap-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-300 hover:text-white underline"
          >
            פתח בלשונית חדשה ↗
          </a>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-300 text-xl leading-none px-2"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Desktop: inline iframe */}
      <div
        className="hidden sm:flex flex-1 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <iframe
          src={url}
          className="w-full h-full border-0"
          title="תצוגת מסמך"
        />
      </div>

      {/* Mobile: iOS Safari cannot render PDFs in iframes */}
      <div
        className="sm:hidden flex-1 flex flex-col items-center justify-center gap-5 px-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-5xl">📄</div>
        <p className="text-white text-center text-sm">לא ניתן להציג PDF בתוך החלון במכשיר זה</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 active:bg-orange-700"
          onClick={onClose}
        >
          פתח את המסמך ←
        </a>
      </div>
    </div>
  );
}

// ─── כפתור פעולה על קובץ (צפייה / הורדה) ──────────────────────
function FileActionButton({ fileUrl, download, label, onPreview }: {
  fileUrl: string;
  download: boolean;
  label: string;
  onPreview?: (url: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  async function handleClick() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ path: fileUrl });
      if (download) params.set('download', '1');
      const res = await fetch(`/api/signed-url?${params}`);
      const d = await res.json();
      if (d.url) {
        if (!download && onPreview) {
          onPreview(d.url);
        } else {
          window.open(d.url, '_blank');
        }
      }
    } finally { setLoading(false); }
  }
  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`text-xs disabled:opacity-50 ${download ? 'text-gray-500 hover:text-gray-700' : 'text-orange-500 hover:text-orange-600'}`}
    >
      {loading ? '...' : label}
    </button>
  );
}

