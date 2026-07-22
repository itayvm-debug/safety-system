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

// ─── Issue detail builders ─────────────────────────────────────
function issueCell(problems: string[]): string {
  if (problems.length === 0) return '<span style="color:#16a34a">✓ תקין</span>';
  return `<span style="color:#dc2626;font-size:10px;line-height:1.65">${problems.join('<br/>')}</span>`;
}

function getWorkerIssueDetails(w: WorkerWithDocuments): string {
  const problems: string[] = [];
  const docMap = new Map(w.documents.map((d) => [d.doc_type, d]));

  if (!docMap.get('id_document')?.file_url) problems.push('חסר צילום תעודת זהות');

  if (w.is_foreign_worker) {
    const visa = docMap.get('work_visa');
    const s = getDocumentStatus(visa?.file_url ?? null, visa?.expiry_date ?? null, true, true);
    if (s === 'missing') problems.push('חסרה אשרת עבודה');
    else if (s === 'expired') problems.push('אשרת עבודה פגת תוקף');
    else if (s === 'expiring_soon') problems.push('אשרת עבודה עומדת לפוג');
  }

  const latestBriefing = (w.safety_briefings ?? [])
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
  const bs = getBriefingStatus(latestBriefing);
  if (bs === 'missing') problems.push('חסר תדריך בטיחות');
  else if (bs === 'expired') problems.push('תדריך בטיחות פג תוקף');
  else if (bs === 'expiring_soon') problems.push('תדריך בטיחות עומד לפוג');

  const heightPermit = docMap.get('height_permit');
  const hs = getHeightCombinedStatus(heightPermit, w.height_restrictions ?? []);
  if (hs === 'missing') problems.push('חסר אישור עבודה בגובה');
  else if (hs === 'expired') problems.push('אישור עבודה בגובה פג תוקף');
  else if (hs === 'expiring_soon') problems.push('אישור עבודה בגובה עומד לפוג');

  for (const lic of (w.professional_licenses ?? [])) {
    const ls = getDocumentStatus(lic.file_url, lic.expiry_date, true, true);
    if (ls === 'missing') problems.push(`חסר מסמך: ${lic.license_type}`);
    else if (ls === 'expired') problems.push(`פג תוקף: ${lic.license_type}`);
    else if (ls === 'expiring_soon') problems.push(`עומד לפוג: ${lic.license_type}`);
  }

  return issueCell(problems);
}

function getVehicleIssueDetails(v: Vehicle): string {
  const problems: string[] = [];
  const lic = (v.vehicle_licenses ?? [])[0] ?? null;
  const mandatory = (v.vehicle_insurances ?? []).find((i) => i.insurance_type === 'ביטוח חובה') ?? null;
  const comprehensive = (v.vehicle_insurances ?? []).find((i) => i.insurance_type === 'ביטוח מקיף') ?? null;

  const ls = getDocumentStatus(lic?.file_url ?? null, lic?.expiry_date ?? null, true, true);
  if (ls === 'missing') problems.push('חסר רישיון רכב');
  else if (ls === 'expired') problems.push('רישיון רכב פג תוקף');
  else if (ls === 'expiring_soon') problems.push('רישיון רכב עומד לפוג');

  const ms = getDocumentStatus(mandatory?.file_url ?? null, mandatory?.expiry_date ?? null, true, true);
  if (ms === 'missing') problems.push('חסר ביטוח חובה');
  else if (ms === 'expired') problems.push('ביטוח חובה פג תוקף');
  else if (ms === 'expiring_soon') problems.push('ביטוח חובה עומד לפוג');

  const cs = getDocumentStatus(comprehensive?.file_url ?? null, comprehensive?.expiry_date ?? null, false, true);
  if (cs === 'expired') problems.push('ביטוח מקיף פג תוקף');
  else if (cs === 'expiring_soon') problems.push('ביטוח מקיף עומד לפוג');

  return issueCell(problems);
}

function getEquipmentIssueDetails(eq: HeavyEquipment): string {
  const problems: string[] = [];

  const ls = getDocumentStatus(eq.license_file_url, eq.license_expiry, true, true);
  if (ls === 'missing') problems.push('חסר רישיון/רישוי');
  else if (ls === 'expired') problems.push('רישיון פג תוקף');
  else if (ls === 'expiring_soon') problems.push('רישיון עומד לפוג');

  const is_ = getDocumentStatus(eq.insurance_file_url, eq.insurance_expiry, true, true);
  if (is_ === 'missing') problems.push('חסר ביטוח חובה');
  else if (is_ === 'expired') problems.push('ביטוח חובה פג תוקף');
  else if (is_ === 'expiring_soon') problems.push('ביטוח חובה עומד לפוג');

  return issueCell(problems);
}

// ─── HTML shell — header repeated per page ─────────────────────
function buildHtmlShell(
  title: string,
  headers: string[],
  rows: string,
  count: number,
  pageLabel?: string,
): string {
  const today = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const headerCells = headers.map((h) => `<th>${h}</th>`).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; direction: rtl; background: white; color: #1e293b; font-size: 12px; }
    .page { max-width: 1100px; margin: 0 auto; padding: 28px 36px; background: white; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #ea580c; padding-bottom: 14px; margin-bottom: 20px; }
    .logo { width: 52px; height: 52px; object-fit: contain; }
    .company h1 { font-size: 17px; font-weight: 700; }
    .company p { font-size: 11px; color: #64748b; margin-top: 2px; }
    .report-title { font-size: 17px; font-weight: 700; color: #ea580c; margin-bottom: 4px; }
    .report-meta { font-size: 11px; color: #94a3b8; }
    .report-meta span { display: inline-block; margin-left: 14px; }
    .table-wrap { border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #1e293b; color: #f8fafc; padding: 10px 10px; text-align: right; font-weight: 600; font-size: 10.5px; }
    td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; vertical-align: top; line-height: 1.5; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #f8fafc; }
    tr:nth-child(odd) td { background: white; }
    .footer { margin-top: 16px; font-size: 10px; color: #94a3b8; text-align: center; padding-top: 10px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="report-title">${title}</div>
        <div class="report-meta">
          <span>תאריך הפקה: ${today}</span>
          <span>סה"כ: ${count} רשומות</span>
          ${pageLabel ? `<span style="color:#ea580c;font-weight:600">${pageLabel}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="company" style="text-align:right"><h1>SafeDoc</h1><p>ניהול בטיחות · איתי ולדמן</p></div>
        <img src="/logo.png" class="logo" />
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="footer">SafeDoc · איתי ולדמן · הופק ב-${today}</div>
  </div>
</body>
</html>`;
}

// ─── Splits row array into multiple page HTMLs ─────────────────
function buildHtmlPages(
  title: string,
  headers: string[],
  rows: string[],
  count: number,
  rowsPerPage: number,
): string[] {
  const totalPages = Math.ceil(rows.length / rowsPerPage) || 1;
  const pages: string[] = [];
  for (let p = 0; p < totalPages; p++) {
    const pageRows = rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage).join('');
    const pageLabel = totalPages > 1 ? `עמוד ${p + 1} מתוך ${totalPages}` : undefined;
    pages.push(buildHtmlShell(title, headers, pageRows, count, pageLabel));
  }
  return pages;
}

// ─── עובדים ───────────────────────────────────────────────────
export function buildWorkersHtml(workers: WorkerWithDocuments[], title: string): string[] {
  const rows = workers.map((w) => {
    const docMap = new Map(w.documents.map((d) => [d.doc_type, d]));
    const visa = docMap.get('work_visa');
    const heightPermit = docMap.get('height_permit');
    const latestBriefing = (w.safety_briefings ?? [])
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

    const heightLabel   = STATUS_LABELS[getHeightCombinedStatus(heightPermit, w.height_restrictions ?? [])];
    const briefingLabel = STATUS_LABELS[getBriefingStatus(latestBriefing)];
    const visaLabel     = w.is_foreign_worker
      ? STATUS_LABELS[getDocumentStatus(visa?.file_url ?? null, visa?.expiry_date ?? null, true, true)]
      : '—';
    const overallLabel  = STATUS_LABELS[getWorkerStatus(w)];
    const issueDetails  = getWorkerIssueDetails(w);

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
      <td>${issueDetails}</td>
      <td>${w.is_active ? 'פעיל' : 'לא פעיל'}</td>
    </tr>`;
  });

  const headers = ['שם מלא', 'מספר מזהה', 'סוג', 'קבלן משנה', 'פרויקט', 'עבודה בגובה', 'אשרת עבודה', 'תדריך', 'סטטוס', 'פירוט ליקויים', 'פעיל'];
  return buildHtmlPages(title, headers, rows, workers.length, 12);
}

// ─── רכבים ────────────────────────────────────────────────────
export function buildVehiclesHtml(vehicles: Vehicle[], title: string): string[] {
  const rows = vehicles.map((v) => {
    const lic = (v.vehicle_licenses ?? [])[0] ?? null;
    const mandatory = (v.vehicle_insurances ?? []).find((i) => i.insurance_type === 'ביטוח חובה');
    const statusLabel = STATUS_LABELS[getVehicleStatus(v)];
    const issueDetails = getVehicleIssueDetails(v);

    return `<tr>
      <td>${v.vehicle_type}${v.model ? ` · ${v.model}` : ''}</td>
      <td dir="ltr">${v.vehicle_number}</td>
      <td>${v.vehicle_color ?? '—'}</td>
      <td>${v.assigned_manager?.full_name ?? '—'}</td>
      <td>${v.project_name ?? '—'}</td>
      <td>${lic?.expiry_date ?? '—'}</td>
      <td>${mandatory?.expiry_date ?? '—'}</td>
      <td style="color:${statusColor(statusLabel)};font-weight:600">${statusLabel}</td>
      <td>${issueDetails}</td>
      <td>${v.is_active ? 'פעיל' : 'לא פעיל'}</td>
    </tr>`;
  });

  const headers = ['סוג / דגם', 'מספר רכב', 'צבע', 'עובד משויך', 'פרויקט', 'רישיון — תוקף', 'ביטוח חובה — תוקף', 'סטטוס', 'פירוט ליקויים', 'פעיל'];
  return buildHtmlPages(title, headers, rows, vehicles.length, 15);
}

// ─── כלי צמ"ה ─────────────────────────────────────────────────
export function buildEquipmentHtml(equipment: HeavyEquipment[], title: string): string[] {
  const rows = equipment.map((eq) => {
    const licLabel  = STATUS_LABELS[getDocumentStatus(eq.license_file_url, eq.license_expiry, true, true)];
    const insLabel  = STATUS_LABELS[getDocumentStatus(eq.insurance_file_url, eq.insurance_expiry, true, true)];
    const overall   = STATUS_LABELS[getHeavyEquipmentStatus(eq)];
    const issueDetails = getEquipmentIssueDetails(eq);

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
      <td>${issueDetails}</td>
      <td>${eq.is_active ? 'פעיל' : 'לא פעיל'}</td>
    </tr>`;
  });

  const headers = ['תיאור', 'מספר רישוי', 'קבלן משנה', 'פרויקט', 'רישיון', 'ביטוח', 'תוקף רישיון', 'תוקף ביטוח', 'סטטוס', 'פירוט ליקויים', 'פעיל'];
  return buildHtmlPages(title, headers, rows, equipment.length, 15);
}

// ─── דורש טיפול ───────────────────────────────────────────────
export function buildIssuesHtml(issues: Issue[], title: string): string[] {
  const ENTITY_LABELS: Record<Issue['entityType'], string> = {
    worker: 'עובד', vehicle: 'רכב', heavy_equipment: 'כלי צמ"ה', lifting_equipment: 'ציוד הרמה', subcontractor: 'קבלן משנה',
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
  });

  const headers = ['סוג ישות', 'שם', 'פירוט ליקוי', 'סטטוס', 'קבלן משנה', 'מנהל עבודה'];
  return buildHtmlPages(title, headers, rows, issues.length, 20);
}

// ─── PDF generator — renders each page separately ──────────────
export async function generatePdf(pages: string | string[], filename: string): Promise<void> {
  const [jsPDFModule, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const { default: jsPDF } = jsPDFModule as { default: typeof import('jspdf').default };
  const { default: html2canvas } = html2canvasModule as { default: typeof import('html2canvas').default };

  const htmlPages = Array.isArray(pages) ? pages : [pages];
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < htmlPages.length; i++) {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1400px;background:white;';
    container.innerHTML = htmlPages[i];
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      if (i > 0) pdf.addPage();

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const ratio   = canvas.height / canvas.width;
      const imgH    = pageW * ratio;

      if (imgH <= pageH) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pageW, imgH);
      } else {
        // Fallback: content taller than one page — slice
        let remaining = imgH;
        let firstSlice = true;
        while (remaining > 0) {
          const slice = Math.min(pageH, remaining);
          const srcY  = ((imgH - remaining) / imgH) * canvas.height;
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width  = canvas.width;
          sliceCanvas.height = (slice / imgH) * canvas.height;
          sliceCanvas.getContext('2d')!.drawImage(
            canvas, 0, srcY, canvas.width, sliceCanvas.height,
            0, 0, canvas.width, sliceCanvas.height,
          );
          if (!firstSlice) pdf.addPage();
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, slice);
          remaining -= pageH;
          firstSlice = false;
        }
      }
    } finally {
      document.body.removeChild(container);
    }
  }

  pdf.save(filename);
}
