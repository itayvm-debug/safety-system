/**
 * "Briefing from the system": the company's template PDF + a footer with the worker's details,
 * the instructor and the worker's signature → uploaded to briefings/ → safety_briefings row.
 *
 * Browser only (canvas, pdf-lib). Shared by the single-worker flow (SafetyBriefingCard) and the
 * group briefing (2026-11-20) so both produce exactly the same signed document.
 */
import type { BriefingLanguage, SafetyBriefing, WorkerWithDocuments } from '@/types';
import { fitInBox } from '@/lib/documents/signature-fit';

type BriefingWorker = Pick<WorkerWithDocuments, 'id' | 'full_name' | 'id_number'>
  & Partial<Pick<WorkerWithDocuments, 'national_id' | 'passport_number'>>;

/** ID / passport printed in the footer; never the text "null" (seen 2026-11-20 on a worker without one). */
export function footerIdText(worker: BriefingWorker): string {
  return (worker.id_number || worker.national_id || worker.passport_number || '').trim() || '—';
}

/** Template for the language as configured for the active company (/api/briefing-template). */
export async function fetchBriefingTemplateUrl(language: BriefingLanguage): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`/api/briefing-template?language=${language}`);
  } catch {
    throw new Error('שגיאת תקשורת בטעינת תבנית');
  }
  const d = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !d.url) throw new Error(d.error ?? 'שגיאה בטעינת תבנית התדריך');
  return d.url;
}

// ─── footer canvas (the browser handles RTL / Hebrew / Arabic) ───────────────
export async function renderFooterCanvas({
  worker, language, conductedBy, briefedAt, signatureDataUrl,
}: {
  worker: BriefingWorker;
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

  // No background: the block must never hide anything printed on the template (2026-11-20).

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
    ctx.fillText(`שם: ${worker.full_name}    ת.ז.: ${footerIdText(worker)}`, AX, 26);
    ctx.fillText(`תאריך: ${fmt(briefedAt)}    תוקף: ${exp.toLocaleDateString('he-IL')}`, AX, 48);
    ctx.fillText(`מדריך: ${conductedBy}`, AX, 70);
  } else {
    ctx.fillText(`Name: ${worker.full_name}    ID: ${footerIdText(worker)}`, AX, 26);
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
    const fit = fitInBox(sigImg.naturalWidth, sigImg.naturalHeight, { x: SX, y: 92, w: sigW, h: sigH });
    ctx.drawImage(sigImg, fit.x, fit.y, fit.w, fit.h);
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

// ─── PDF: the template + the footer on the last page ─────────────────────────
export async function generateBriefingPDF({
  worker, language, conductedBy, signatureDataUrl, briefedAt, templateUrl,
}: {
  worker: BriefingWorker;
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

  const footerCanvas = await renderFooterCanvas({ worker, language, conductedBy, briefedAt, signatureDataUrl });

  const dataUrl = footerCanvas.toDataURL('image/png');
  const pngBytes = Uint8Array.from(atob(dataUrl.slice('data:image/png;base64,'.length)), (c) => c.charCodeAt(0));

  const footerImg = await pdfDoc.embedPng(pngBytes);
  const margin = 30;
  // Above the template's own page footer (logo / page number, up to 97pt high in the company
  // templates) and below the body text (ends ≥275pt from the bottom). Checked for every template
  // by scripts/check-briefing-signature-zone.py → lib/briefings/signature-zone-check.json.
  const drawW = width - margin * 2;
  const drawH = drawW * (footerCanvas.height / footerCanvas.width);
  lastPage.drawImage(footerImg, { x: margin, y: SIGNATURE_BLOCK_BOTTOM_PT, width: drawW, height: drawH });

  const bytes = await pdfDoc.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

/**
 * Bottom of the signature block on the template's last page, in PDF points. Until 2026-11-20 it
 * was 30pt with a white background, which hid the logo of the templates' page footer.
 */
export const SIGNATURE_BLOCK_BOTTOM_PT = 105;

/** The upload limit (30 per 10 minutes per user) was reached; nothing was recorded. */
export class RateLimitedError extends Error {
  constructor(public readonly retryAfterSec: number, message: string) {
    super(message);
    this.name = 'RateLimitedError';
  }
}

/** Date of a briefing done now — as the single-worker flow has always recorded it. */
export function briefingDateToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * PDF → upload → record. Throws an Error with a Hebrew message at the step that failed;
 * nothing is recorded unless the PDF was generated and uploaded.
 */
export async function saveSystemBriefing(
  {
    worker, language, conductedBy, signatureDataUrl, templateUrl, briefedAt = briefingDateToday(),
  }: {
    worker: BriefingWorker;
    language: BriefingLanguage;
    conductedBy: string;
    signatureDataUrl: string;
    templateUrl: string;
    briefedAt?: string;
  },
  onStatus: (status: string) => void = () => {},
): Promise<SafetyBriefing> {
  onStatus('מייצר PDF...');
  let pdfBlob: Blob;
  try {
    pdfBlob = await generateBriefingPDF({ worker, language, conductedBy, signatureDataUrl, briefedAt, templateUrl });
  } catch (e) {
    throw new Error(`שגיאה ביצירת PDF: ${e instanceof Error ? e.message : String(e)}`);
  }

  onStatus('מעלה PDF...');
  const fd = new FormData();
  fd.append('file', pdfBlob, 'briefing.pdf');
  fd.append('folder', 'briefings');
  const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
  const uploadData = (await uploadRes.json().catch(() => ({}))) as { path?: string; error?: string };
  if (uploadRes.status === 429) {
    throw new RateLimitedError(Number(uploadRes.headers.get('Retry-After')) || 60, uploadData.error ?? 'יותר מדי העלאות');
  }
  if (!uploadRes.ok || !uploadData.path) throw new Error(`שגיאה בהעלאה: ${uploadData.error ?? uploadRes.status}`);

  onStatus('שומר...');
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
  const saved = (await res.json().catch(() => ({}))) as SafetyBriefing & { error?: string };
  if (!res.ok) throw new Error(saved.error ?? 'שגיאה בשמירה');
  return saved;
}
