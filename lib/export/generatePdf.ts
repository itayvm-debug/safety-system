import { getWorkerIdentifierValue } from '@/lib/workers/identifier';
import {
  getDocumentStatus,
  getWorkerStatus,
  getVehicleStatus,
  getHeavyEquipmentStatus,
  getBriefingStatus,
  getHeightCombinedStatus,
  STATUS_LABELS,
} from '@/lib/documents/status';
import type { WorkerWithDocuments, Vehicle, HeavyEquipment } from '@/types';
import type { Issue } from '@/lib/documents/issues';

// ─── Helper colors ─────────────────────────────────────────────
function statusColor(label: string): string {
  if (label === 'תקין') return '#16a34a';
  if (label === 'עומד לפוג') return '#d97706';
  return '#dc2626';
}

// ─── HTML shell ────────────────────────────────────────────────
function buildHtmlShell(title: string, headers: string[], rows: string, count: number): string {
  const today = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const headerCells = headers.map((h) => `<th>${h}</th>`).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; direction: rtl; background: white; color: #1e293b; padding: 24px; font-size: 11px; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #ea580c; padding-bottom: 12px; margin-bottom: 16px; }
    .logo { width: 52px; height: 52px; object-fit: contain; }
    .company h1 { font-size: 17px; font-weight: 700; }
    .company p { font-size: 11px; color: #64748b; }
    .report-title { font-size: 15px; font-weight: 700; color: #ea580c; margin-bottom: 2px; }
    .report-meta { font-size: 10px; color: #94a3b8; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #f1f5f9; padding: 7px 5px; text-align: right; font-weight: 600; border: 1px solid #e2e8f0; color: #475569; }
    td { padding: 6px 5px; border: 1px solid #e2e8f0; text-align: right; vertical-align: middle; }
    tr:nth-child(even) td { background: #f8fafc; }
    .footer { margin-top: 14px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="report-title">${title}</div>
      <div class="report-meta">תאריך הפקה: ${today} · סה"כ: ${count} רשומות</div>
    </div>
    <div style="text-align:center;display:flex;align-items:center;gap:10px">
      <img src="/logo.png" class="logo" />
      <div class="company"><h1>נתן ולדמן ובניו בע"מ</h1><p>ניהול בטיחות</p></div>
    </div>
  </div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">SafeDoc · נתן ולדמן ובניו בע"מ · הופק ב-${today}</div>
</body>
</html>`;
}

// ─── עובדים ───────────────────────────────────────────────────
export function buildWorkersHtml(workers: WorkerWithDocuments[], title: string): string {
  const rows = workers.map((w) => {
    const docMap = new Map(w.documents.map((d) => [d.doc_type, d]));
    const visa = docMap.get('work_visa');
    const heightPermit = docMap.get('height_permit');
    const latestBriefing = (w.safety_briefings ?? [])
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

    const heightLabel = STATUS_LABELS[getHeightCombinedStatus(heightPermit, w.height_restrictions ?? [])];
    const briefingLabel = STATUS_LABELS[getBriefingStatus(latestBriefing)];
    const visaLabel = w.is_foreign_worker
      ? STATUS_LABELS[getDocumentStatus(visa?.file_url ?? null, visa?.expiry_date ?? null, true, true)]
      : '—';
    const overallLabel = STATUS_LABELS[getWorkerStatus(w)];

    return `<tr>
      <td>${w.full_name}</td>
      <td dir="ltr">${getWorkerIdentifierValue(w)}</td>
      <td>${w.is_foreign_worker ? 'זר' : 'ישראלי'}</td>
      <td>${w.subcontractor?.name ?? '—'}</td>
      <td>${w.project_name ?? '—'}</td>
      <td style="color:${statusColor(heightLabel)};font-weight:600">${heightLabel}</td>
      <td style="color:${statusColor(visaLabel)};font-weight:600">${visaLabel}</td>
      <td style="color:${statusColor(briefingLabel)};font-weight:600">${briefingLabel}</td>
      <td style="color:${statusColor(overallLabel)};font-weight:600">${overallLabel}</td>
      <td>${w.is_active ? 'פעיל' : 'לא פעיל'}</td>
    </tr>`;
  }).join('');

  const headers = ['שם מלא', 'מספר מזהה', 'סוג', 'קבלן משנה', 'פרויקט', 'עבודה בגובה', 'אשרת עבודה', 'תדריך', 'סטטוס', 'פעיל'];
  return buildHtmlShell(title, headers, rows, workers.length);
}

// ─── רכבים ────────────────────────────────────────────────────
export function buildVehiclesHtml(vehicles: Vehicle[], title: string): string {
  const rows = vehicles.map((v) => {
    const lic = (v.vehicle_licenses ?? [])[0] ?? null;
    const mandatory = (v.vehicle_insurances ?? []).find((i) => i.insurance_type === 'ביטוח חובה');
    const statusLabel = STATUS_LABELS[getVehicleStatus(v)];

    return `<tr>
      <td>${v.vehicle_type}${v.model ? ` · ${v.model}` : ''}</td>
      <td dir="ltr">${v.vehicle_number}</td>
      <td>${v.vehicle_color ?? '—'}</td>
      <td>${v.assigned_manager?.full_name ?? '—'}</td>
      <td>${v.project_name ?? '—'}</td>
      <td>${lic?.expiry_date ?? '—'}</td>
      <td>${mandatory?.expiry_date ?? '—'}</td>
      <td style="color:${statusColor(statusLabel)};font-weight:600">${statusLabel}</td>
      <td>${v.is_active ? 'פעיל' : 'לא פעיל'}</td>
    </tr>`;
  }).join('');

  const headers = ['סוג / דגם', 'מספר רכב', 'צבע', 'עובד משויך', 'פרויקט', 'רישיון — תוקף', 'ביטוח חובה — תוקף', 'סטטוס', 'פעיל'];
  return buildHtmlShell(title, headers, rows, vehicles.length);
}

// ─── כלי צמ"ה ─────────────────────────────────────────────────
export function buildEquipmentHtml(equipment: HeavyEquipment[], title: string): string {
  const rows = equipment.map((eq) => {
    const licLabel = STATUS_LABELS[getDocumentStatus(eq.license_file_url, eq.license_expiry, true, true)];
    const insLabel = STATUS_LABELS[getDocumentStatus(eq.insurance_file_url, eq.insurance_expiry, true, true)];
    const overall = STATUS_LABELS[getHeavyEquipmentStatus(eq)];

    return `<tr>
      <td>${eq.description}</td>
      <td dir="ltr">${eq.license_number ?? '—'}</td>
      <td>${eq.subcontractor?.name ?? '—'}</td>
      <td>${eq.project_name ?? '—'}</td>
      <td style="color:${statusColor(licLabel)};font-weight:600">${licLabel}</td>
      <td style="color:${statusColor(insLabel)};font-weight:600">${insLabel}</td>
      <td>${eq.license_expiry ?? '—'}</td>
      <td>${eq.insurance_expiry ?? '—'}</td>
      <td style="color:${statusColor(overall)};font-weight:600">${overall}</td>
      <td>${eq.is_active ? 'פעיל' : 'לא פעיל'}</td>
    </tr>`;
  }).join('');

  const headers = ['תיאור', 'מספר רישוי', 'קבלן משנה', 'פרויקט', 'רישיון', 'ביטוח', 'תוקף רישיון', 'תוקף ביטוח', 'סטטוס', 'פעיל'];
  return buildHtmlShell(title, headers, rows, equipment.length);
}

// ─── דורש טיפול ───────────────────────────────────────────────
export function buildIssuesHtml(issues: Issue[], title: string): string {
  const ENTITY_LABELS: Record<Issue['entityType'], string> = {
    worker: 'עובד', vehicle: 'רכב', heavy_equipment: 'כלי צמ"ה', lifting_equipment: 'ציוד הרמה',
  };
  const STATUS_LABEL: Record<Issue['status'], string> = {
    expired: 'פג תוקף', expiring_soon: 'עומד לפוג', missing: 'חסר',
  };

  const rows = issues.map((i) => {
    const statusLabel = STATUS_LABEL[i.status];
    return `<tr>
      <td>${ENTITY_LABELS[i.entityType]}</td>
      <td>${i.entityName}</td>
      <td>${i.problem}</td>
      <td style="color:${statusColor(statusLabel === 'עומד לפוג' ? 'עומד לפוג' : 'לא תקין')};font-weight:600">${statusLabel}</td>
      <td>${i.subcontractorName ?? '—'}</td>
      <td>${i.managerName ?? '—'}</td>
    </tr>`;
  }).join('');

  const headers = ['סוג ישות', 'שם', 'ליקוי', 'סטטוס', 'קבלן משנה', 'מנהל עבודה'];
  return buildHtmlShell(title, headers, rows, issues.length);
}

// ─── PDF generator (html2canvas + jsPDF) ──────────────────────
export async function generatePdf(html: string, filename: string): Promise<void> {
  const [jsPDFModule, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const { default: jsPDF } = jsPDFModule as { default: typeof import('jspdf').default };
  const { default: html2canvas } = html2canvasModule as { default: typeof import('html2canvas').default };

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1400px;background:white;';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.height / canvas.width;
    const imgH = pageW * ratio;

    if (imgH <= pageH) {
      pdf.addImage(imgData, 'JPEG', 0, 0, pageW, imgH);
    } else {
      let remaining = imgH;
      let firstPage = true;
      while (remaining > 0) {
        const slice = Math.min(pageH, remaining);
        const srcY = ((imgH - remaining) / imgH) * canvas.height;
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = (slice / imgH) * canvas.height;
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, srcY, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
        if (!firstPage) pdf.addPage();
        pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, slice);
        remaining -= pageH;
        firstPage = false;
      }
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}
