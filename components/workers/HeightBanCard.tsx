'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  HeightRestriction,
  BriefingLanguage,
  BRIEFING_LANGUAGE_LABELS,
  WorkerWithDocuments,
} from '@/types';
import StatusBadge from '@/components/StatusBadge';
import { format, parseISO, differenceInDays, startOfDay, addYears } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  worker: WorkerWithDocuments;
  restrictions: HeightRestriction[];
}

function getRestrictionStatus(r: HeightRestriction) {
  const today = startOfDay(new Date());
  const expiry = startOfDay(parseISO(r.expires_at));
  const daysLeft = differenceInDays(expiry, today);
  if (daysLeft < 0) return 'expired' as const;
  if (daysLeft <= 14) return 'expiring_soon' as const;
  return 'valid' as const;
}

export default function HeightBanCard({ worker, restrictions }: Props) {
  const [localRestrictions, setLocalRestrictions] = useState<HeightRestriction[]>(restrictions);
  const [formOpen, setFormOpen] = useState(false);

  const latest = [...localRestrictions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0] ?? null;

  async function handleDelete(id: string) {
    if (!confirm('למחוק את רשומת האיסור?')) return;
    const res = await fetch('/api/height-restrictions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restriction_id: id }),
    });
    if (res.ok) setLocalRestrictions((prev) => prev.filter((r) => r.id !== id));
  }

  function close() { setFormOpen(false); }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {/* מצב נוכחי */}
      {latest && (
        <div className="mb-4 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-gray-700">
                הופק: {format(parseISO(latest.issued_at), 'dd/MM/yyyy', { locale: he })}
              </p>
              <p className="text-sm text-gray-500">
                תוקף עד: {format(parseISO(latest.expires_at), 'dd/MM/yyyy', { locale: he })}
              </p>
              {latest.conducted_by && (
                <p className="text-sm text-gray-500">מדריך: {latest.conducted_by}</p>
              )}
            </div>
            <StatusBadge status={getRestrictionStatus(latest)} size="sm" />
          </div>
          <div className="flex gap-2 mt-2">
            {latest.file_url && (
              <ViewFileButton fileUrl={latest.file_url} label="צפה ב-PDF" />
            )}
            <button
              onClick={() => handleDelete(latest.id)}
              className="text-sm text-red-400 hover:text-red-600 px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              מחק
            </button>
          </div>
        </div>
      )}

      {/* טופס הפקה */}
      {formOpen ? (
        <HeightBanForm worker={worker} onDone={(r) => { setLocalRestrictions((prev) => [r, ...prev]); close(); }} onCancel={close} />
      ) : (
        <button
          onClick={() => setFormOpen(true)}
          className="w-full py-2.5 border-2 border-dashed border-orange-300 rounded-xl text-orange-500 text-sm font-medium hover:border-orange-400 hover:bg-orange-50 transition-colors"
        >
          {latest ? '+ הפק איסור חדש' : '+ הפק איסור עבודה בגובה'}
        </button>
      )}
    </div>
  );
}

// ─── טופס הפקת איסור (flow בשלבים: שפה → תוכן → חתימה) ──────────
type BanStep = 'language' | 'content' | 'sign';

function HeightBanForm({
  worker,
  onDone,
  onCancel,
}: {
  worker: WorkerWithDocuments;
  onDone: (restriction: HeightRestriction) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<BanStep>('language');
  const [language, setLanguage] = useState<BriefingLanguage>('hebrew');
  const [conductedBy, setConductedBy] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [error, setError] = useState('');

  const missingFields = [
    !language && 'יש לבחור שפה',
    !conductedBy.trim() && 'יש להזין שם המדריך',
    !signatureDataUrl && 'יש לחתום',
  ].filter(Boolean) as string[];

  async function handleFinish() {
    if (missingFields.length > 0) { setError(missingFields.join(' • ')); return; }
    setLoading(true); setError('');

    try {
      const issuedAt = new Date();
      const expiresAt = addYears(issuedAt, 1);

      // שלב 1: יצירת PDF
      setSaveStatus('מייצר PDF...');
      let pdfBlob: Blob;
      try {
        pdfBlob = await generateHeightBanPDF({
          worker, language, conductedBy,
          signatureDataUrl,
          issuedAt, expiresAt,
        });
      } catch (pdfErr) {
        setError(`שגיאה ביצירת PDF: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`);
        return;
      }

      // שלב 2: העלאה
      setSaveStatus('מעלה PDF...');
      const formData = new FormData();
      const pdfFile = new File([pdfBlob], `height-ban-${Date.now()}.pdf`, { type: 'application/pdf' });
      formData.append('file', pdfFile);
      formData.append('folder', 'briefings');
      console.log('[upload:heightban] starting', pdfFile.name, pdfFile.size, pdfFile.type);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      console.log('[upload:heightban] status:', uploadRes.status, uploadRes.ok);
      const uploadData = await uploadRes.json().catch(e => { console.error('[upload:heightban] json parse error:', e, 'content-type:', uploadRes.headers.get('content-type')); return {}; });
      if (!uploadRes.ok) { console.error('[upload:heightban] server error:', uploadRes.status, uploadData); setError(uploadData.error ?? 'שגיאה בהעלאת PDF'); return; }

      // שלב 3: שמירה ב-DB
      setSaveStatus('שומר...');
      const saveRes = await fetch('/api/height-restrictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: worker.id,
          language,
          conducted_by: conductedBy.trim(),
          file_url: uploadData.path,
        }),
      });
      const savedRestriction = await saveRes.json();
      if (!saveRes.ok) { setError(savedRestriction.error ?? 'שגיאה בשמירה'); return; }

      onDone(savedRestriction);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
      setSaveStatus('');
    }
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 space-y-4">

      {/* שלב 1: בחירת שפה + מדריך */}
      {step === 'language' && (
        <>
          <p className="text-sm font-medium text-gray-700">שפת האם של העובד:</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.entries(BRIEFING_LANGUAGE_LABELS) as [BriefingLanguage, string][]).map(([lang, label]) => (
              <button key={lang} type="button" onClick={() => setLanguage(lang)}
                className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                  language === lang
                    ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם המדריך / מפיק האיסור</label>
            <input type="text" value={conductedBy} onChange={(e) => setConductedBy(e.target.value)}
              placeholder="שם מנהל הבטיחות / מנהל העבודה"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => {
              if (!conductedBy.trim()) { setError('יש להזין שם מפיק האיסור'); return; }
              setError(''); setStep('content');
            }} className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600">
              המשך לתוכן האיסור ←
            </button>
            <button onClick={onCancel} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">ביטול</button>
          </div>
        </>
      )}

      {/* שלב 2: צפייה ב-PDF המקורי */}
      {step === 'content' && (
        <PdfViewer
          src={`/height-ban-templates/${language}.pdf`}
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
              <button onClick={handleFinish} disabled={!signatureDataUrl || loading}
                className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 disabled:opacity-50">
                {loading ? (saveStatus || 'שומר...') : 'הפק ושמור איסור'}
              </button>
              <button onClick={() => setStep('content')} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">חזרה</button>
            </div>
            {!signatureDataUrl && <p className="text-xs text-red-500">• יש לחתום לפני שמירה</p>}
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

// ─── לוח חתימה ────────────────────────────────────────────────
function SignatureCanvas({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasSignatureRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

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
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
    hasSignatureRef.current = true;
    setHasSignature(true);
  }, []);

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
      <canvas ref={canvasRef} width={600} height={140}
        className="border-2 border-dashed border-gray-300 rounded-lg w-full touch-none bg-white cursor-crosshair"
        style={{ maxHeight: '110px' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div className="flex gap-2 mt-1.5">
        <button type="button" onClick={clear} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">נקה</button>
        {hasSignature && <p className="text-xs text-green-600 py-1">✓ חתימה נקלטה אוטומטית</p>}
      </div>
    </div>
  );
}

// ─── כפתור צפייה ──────────────────────────────────────────────
function ViewFileButton({ fileUrl, label }: { fileUrl: string; label: string }) {
  const [opening, setOpening] = useState(false);

  async function handleClick() {
    setOpening(true);
    try {
      const res = await fetch(`/api/signed-url?path=${encodeURIComponent(fileUrl)}`);
      const d = await res.json();
      if (d.url) window.open(d.url, '_blank');
    } finally { setOpening(false); }
  }

  return (
    <button
      onClick={handleClick}
      disabled={opening}
      className="text-sm text-orange-500 hover:text-orange-600 px-3 py-1.5 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-50"
    >
      {opening ? 'פותח...' : label}
    </button>
  );
}

// ─── יצירת PDF איסור ──────────────────────────────────────────
async function generateHeightBanPDF({
  worker,
  language,
  conductedBy,
  signatureDataUrl,
  issuedAt,
  expiresAt,
}: {
  worker: WorkerWithDocuments;
  language: BriefingLanguage;
  conductedBy: string;
  signatureDataUrl: string;
  issuedAt: Date;
  expiresAt: Date;
}): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');

  const templateRes = await fetch(`/height-ban-templates/${language}.pdf`);
  if (!templateRes.ok) throw new Error(`קובץ תבנית לא נמצא: ${language}.pdf`);

  const pdfDoc = await PDFDocument.load(await templateRes.arrayBuffer());
  const lastPage = pdfDoc.getPages().at(-1)!;
  const { width } = lastPage.getSize();

  const isRTL = language === 'hebrew' || language === 'arabic';
  const footerCanvas = await renderFooterCanvas({
    worker, language, conductedBy, issuedAt, expiresAt, signatureDataUrl, isRTL,
  });

  const dataUrl = footerCanvas.toDataURL('image/png');
  const pngBytes = Uint8Array.from(atob(dataUrl.slice('data:image/png;base64,'.length)), c => c.charCodeAt(0));
  const footerImg = await pdfDoc.embedPng(pngBytes);

  const margin = 30;
  const drawW = width - margin * 2;
  const drawH = drawW * (footerCanvas.height / footerCanvas.width);
  lastPage.drawImage(footerImg, { x: margin, y: margin, width: drawW, height: drawH });

  const bytes = await pdfDoc.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

async function renderFooterCanvas({
  worker,
  conductedBy,
  issuedAt,
  expiresAt,
  signatureDataUrl,
  isRTL,
}: {
  worker: WorkerWithDocuments;
  language: BriefingLanguage;
  conductedBy: string;
  issuedAt: Date;
  expiresAt: Date;
  signatureDataUrl: string;
  isRTL: boolean;
}): Promise<HTMLCanvasElement> {
  const W = 900, H = 270, SCALE = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  ctx.direction = isRTL ? 'rtl' : 'ltr';
  ctx.textAlign = isRTL ? 'right' : 'left';
  const AX = isRTL ? W - 16 : 16;

  // כותרת
  ctx.font = 'bold 15px Arial';
  ctx.fillStyle = '#ea580c';
  ctx.fillText('איסור עבודה בגובה', AX, 28);

  // פרטי עובד (שורות y=50…126)
  ctx.font = '13px Arial';
  ctx.fillStyle = '#1e293b';
  ctx.fillText(`שם: ${worker.full_name}`, AX, 50);
  ctx.fillText(`${worker.is_foreign_worker ? 'דרכון' : 'ת.ז.'}: ${worker.national_id ?? worker.passport_number ?? ''}`, AX, 68);
  ctx.fillText(`תאריך הפקה: ${format(issuedAt, 'dd/MM/yyyy')}`, AX, 86);
  ctx.fillText(`תוקף עד: ${format(expiresAt, 'dd/MM/yyyy')}`, AX, 104);
  ctx.fillText(`מדריך: ${conductedBy}`, AX, 122);

  // קו הפרדה בין פרטים לחתימה
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 138);
  ctx.lineTo(W - 16, 138);
  ctx.stroke();

  // חתימה — מרוכזת מתחת לקו ההפרדה
  if (signatureDataUrl) {
    const img = await new Promise<HTMLImageElement>((res) => {
      const i = new Image(); i.onload = () => res(i); i.src = signatureDataUrl;
    });
    const sigW = 220, sigH = 90;
    const sigX = Math.round((W - sigW) / 2);
    const sigY = 148;
    ctx.drawImage(img, sigX, sigY, sigW, sigH);

    // קו חתימה
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sigX, sigY + sigH + 4);
    ctx.lineTo(sigX + sigW, sigY + sigH + 4);
    ctx.stroke();

    // תווית
    ctx.font = '11px Arial';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('חתימת העובד', W / 2, sigY + sigH + 18);
  }

  return canvas;
}
