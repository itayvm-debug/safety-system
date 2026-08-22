'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import FileUploadZone from '@/components/FileUploadZone';
import {
  SafetyBriefing,
  BriefingLanguage,
  BRIEFING_LANGUAGE_LABELS,
  WorkerWithDocuments,
} from '@/types';
import { getBriefingStatus } from '@/lib/documents/status';
import StatusBadge from '@/components/StatusBadge';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  worker: WorkerWithDocuments;
  briefings: SafetyBriefing[];
}

type Mode = null | 'system' | 'external';

export default function SafetyBriefingCard({ worker, briefings }: Props) {
  const [localBriefings, setLocalBriefings] = useState<SafetyBriefing[]>(briefings);
  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // מיון לפי created_at (timestamp מדויק) ולא briefed_at (רק תאריך)
  // מבטיח שתמיד יוצג התדריך שנוצר אחרון, גם אם שניים נוצרו באותו יום
  const latestBriefing = [...localBriefings].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0] ?? null;

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
      setLocalBriefings((prev) => prev.filter((b) => b.id !== id));
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
        <SystemBriefingFlow worker={worker} onClose={close} onSaved={(b) => { setLocalBriefings((prev) => [b, ...prev]); close(); }} />
      ) : (
        <ExternalModeForm workerId={worker.id} onClose={close} onSaved={(b) => { setLocalBriefings((prev) => [b, ...prev]); close(); }} />
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
      const res = await fetch(`/api/briefing-template?language=${language}`);
      const d = await res.json() as { url?: string; error?: string };
      if (!res.ok || !d.url) {
        setError(d.error ?? 'שגיאה בטעינת תבנית התדריך');
        return;
      }
      setResolvedTemplateUrl(d.url);
      setStep('briefing');
    } catch {
      setError('שגיאת תקשורת בטעינת תבנית');
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
    const briefedAt = new Date().toISOString().split('T')[0];

    try {
      // שלב 1: יצירת PDF — חובה, כישלון עוצר הכל
      setSaveStatus('מייצר PDF...');
      let pdfBlob: Blob;
      try {
        pdfBlob = await generateBriefingPDF({
          worker,
          language: language as BriefingLanguage,
          conductedBy,
          signatureDataUrl,
          briefedAt,
          templateUrl: resolvedTemplateUrl,
        });
      } catch (pdfErr) {
        setError(`שגיאה ביצירת PDF: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`);
        return;
      }

      // שלב 2: העלאה ל-Storage
      setSaveStatus('מעלה PDF...');
      const fd = new FormData();
      fd.append('file', pdfBlob, 'briefing.pdf');
      fd.append('folder', 'briefings');
      console.log('[upload:briefing] starting, blob size:', pdfBlob.size, pdfBlob.type);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
      console.log('[upload:briefing] status:', uploadRes.status, uploadRes.ok);
      const uploadData = await uploadRes.json().catch(e => { console.error('[upload:briefing] json parse error:', e, 'content-type:', uploadRes.headers.get('content-type')); return {}; });
      if (!uploadRes.ok) {
        console.error('[upload:briefing] server error:', uploadRes.status, uploadData);
        setError(`שגיאה בהעלאה: ${uploadData.error ?? uploadRes.status}`);
        return;
      }

      // שלב 3: שמירת רשומה ב-DB
      setSaveStatus('שומר...');
      const res = await fetch('/api/safety-briefings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: worker.id,
          mode: 'system',
          language,
          conducted_by: conductedBy,
          file_url: uploadData.path,
          briefed_at: briefedAt,
        }),
      });
      const savedBriefing = await res.json();
      if (!res.ok) { setError(savedBriefing.error ?? 'שגיאה בשמירה'); return; }
      onSaved(savedBriefing);
    } catch (err) {
      setError(`שגיאה: ${err instanceof Error ? err.message : String(err)}`);
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
            <input
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
        <PdfViewer
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
            <SignatureCanvas onCapture={setSignatureDataUrl} />
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

// ─── צפייה ב-PDF המקורי ─────────────────────────────────────────
function PdfViewer({
  src,
  onContinue,
  onBack,
}: {
  src: string;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-100" style={{ height: '420px' }}>
        <iframe
          src={src}
          className="w-full h-full"
          title="מסמך בטיחות"
        />
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        אם המסמך אינו מוצג —{' '}
        <a href={src} target="_blank" rel="noopener noreferrer" className="text-orange-500 underline">פתח בלשונית חדשה</a>
      </p>
      <div className="flex gap-2 mt-3">
        <button onClick={onContinue} className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600">
          קראתי והבנתי — המשך לחתימה ←
        </button>
        <button onClick={onBack} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">חזרה</button>
      </div>
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
        <input type="date" value={briefedAt} max={today} onChange={(e) => setBriefedAt(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" dir="ltr" />
        <p className="text-xs text-gray-400 mt-0.5">תוקף: שנה מתאריך ביצוע</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">מבצע התדריך (אופציונלי)</label>
        <input type="text" value={conductedBy} onChange={(e) => setConductedBy(e.target.value)} placeholder="שם מנהל העבודה"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">קובץ/תמונה של התדריך</label>
        <FileUploadZone
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

// ─── Canvas חתימה ───────────────────────────────────────────────
function SignatureCanvas({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasSignatureRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Size the canvas buffer to match its CSS-rendered size × devicePixelRatio.
  // pos() already maps CSS coords → buffer coords via (canvas.width / rect.width),
  // so we must NOT also call ctx.scale(dpr) — that would double-scale coordinates.
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }, []);

  function pos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    if ('touches' in e) return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }

  const start = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    drawing.current = true;
    const p = pos(e, canvas);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  }, []);

  const move = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const p = pos(e, canvas);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5 * (window.devicePixelRatio || 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
    hasSignatureRef.current = true;
    setHasSignature(true);
  }, []);

  // Auto-capture on stroke end — no need for a separate "confirm" button
  const end = useCallback(() => {
    drawing.current = false;
    if (hasSignatureRef.current && canvasRef.current) {
      onCapture(canvasRef.current.toDataURL('image/png'));
    }
  }, [onCapture]);

  function clear() {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    hasSignatureRef.current = false;
    setHasSignature(false);
    onCapture('');
  }

  return (
    <div>
      <canvas ref={canvasRef}
        className="border-2 border-dashed border-gray-300 rounded-lg w-full touch-none bg-white cursor-crosshair"
        style={{ height: 'clamp(160px, 22vw, 200px)', display: 'block' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div className="flex gap-2 mt-1.5">
        <button type="button" onClick={clear} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">נקה</button>
        {hasSignature && <p className="text-xs text-green-600 py-1">✓ חתימה נקלטה אוטומטית</p>}
      </div>
    </div>
  );
}

// ─── יצירת footer canvas (browser מטפל ב-RTL/עברית/ערבית) ──────
async function renderFooterCanvas({
  worker,
  language,
  conductedBy,
  briefedAt,
  signatureDataUrl,
}: {
  worker: WorkerWithDocuments;
  language: BriefingLanguage;
  conductedBy: string;
  briefedAt: string;
  signatureDataUrl: string;
}): Promise<HTMLCanvasElement> {
  const isRTL = language === 'hebrew' || language === 'arabic';
  const SCALE = 2;
  const W = 900, H = 200;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // קו כתום עליון
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(0, 0, W, 3);

  ctx.direction = isRTL ? 'rtl' : 'ltr';
  ctx.textAlign = isRTL ? 'right' : 'left';
  const AX = isRTL ? W - 12 : 12;

  // פרטי עובד (שדות דינמיים בלבד)
  const exp = new Date(briefedAt);
  exp.setFullYear(exp.getFullYear() + 1);
  const fmt = (s: string) => new Date(s).toLocaleDateString('he-IL');

  ctx.font = '13px Arial';
  ctx.fillStyle = '#374151';

  if (isRTL) {
    ctx.fillText(`שם: ${worker.full_name}    ת.ז.: ${worker.id_number}`, AX, 26);
    ctx.fillText(`תאריך: ${fmt(briefedAt)}    תוקף: ${exp.toLocaleDateString('he-IL')}`, AX, 48);
    ctx.fillText(`מדריך: ${conductedBy}`, AX, 70);
  } else {
    ctx.fillText(`Name: ${worker.full_name}    ID: ${worker.id_number}`, AX, 26);
    ctx.fillText(`Date: ${fmt(briefedAt)}    Valid until: ${exp.toLocaleDateString('he-IL')}`, AX, 48);
    ctx.fillText(`Instructor: ${conductedBy}`, AX, 70);
  }

  // קו הפרדה
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(12, 84); ctx.lineTo(W - 12, 84); ctx.stroke();

  // חתימה — מרוכזת מתחת לקו ההפרדה
  if (signatureDataUrl) {
    const sigImg = new Image();
    await new Promise<void>((res, rej) => {
      sigImg.onload = () => res();
      sigImg.onerror = rej;
      sigImg.src = signatureDataUrl;
    });
    const sigW = 220, sigH = 80;
    const SX = Math.round((W - sigW) / 2);
    ctx.drawImage(sigImg, SX, 92, sigW, sigH);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(SX, 176); ctx.lineTo(SX + sigW, 176); ctx.stroke();
    ctx.font = '11px Arial';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.fillText(isRTL ? 'חתימת העובד' : 'Worker Signature', W / 2, 191);
  }

  return canvas;
}

// ─── יצירת PDF — טוען template קיים ומוסיף עמוד חתימה ──────────
async function generateBriefingPDF({
  worker,
  language,
  conductedBy,
  signatureDataUrl,
  briefedAt,
  templateUrl,
}: {
  worker: WorkerWithDocuments;
  language: BriefingLanguage;
  conductedBy: string;
  signatureDataUrl: string;
  briefedAt: string;
  templateUrl: string;
}): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');

  const templateRes = await fetch(templateUrl);
  if (!templateRes.ok) {
    throw new Error(`קובץ תבנית לא נמצא: ${templateUrl} (${templateRes.status})`);
  }
  const templateBytes = await templateRes.arrayBuffer();

  const pdfDoc = await PDFDocument.load(templateBytes);
  const lastPage = pdfDoc.getPages().at(-1)!;
  const { width } = lastPage.getSize();

  // מרנדר את footer כ-canvas (browser מטפל ב-RTL/Hebrew/Arabic)
  const footerCanvas = await renderFooterCanvas({
    worker, language, conductedBy, briefedAt, signatureDataUrl,
  });

  // canvas → PNG bytes
  const dataUrl = footerCanvas.toDataURL('image/png');
  const pngBytes = Uint8Array.from(
    atob(dataUrl.slice('data:image/png;base64,'.length)),
    c => c.charCodeAt(0),
  );

  // מטמיע את ה-PNG בעמוד האחרון (bottom section)
  const footerImg = await pdfDoc.embedPng(pngBytes);
  const margin = 30;
  const drawW = width - margin * 2;
  const drawH = drawW * (footerCanvas.height / footerCanvas.width);

  lastPage.drawImage(footerImg, { x: margin, y: margin, width: drawW, height: drawH });

  const bytes = await pdfDoc.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

// ─── מודל תצוגת מסמך מובנה ──────────────────────────────────────
function DocumentPreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-sm font-medium">תצוגת מסמך</span>
        <button
          onClick={onClose}
          className="text-white hover:text-gray-300 text-xl leading-none px-2"
          aria-label="סגור"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-hidden" onClick={e => e.stopPropagation()}>
        <iframe
          src={url}
          className="w-full h-full border-0"
          title="תצוגת מסמך"
        />
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

