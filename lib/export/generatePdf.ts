import { getWorkerIdentifierLabel, getWorkerIdentifierValue } from '@/lib/workers/identifier';
import { getDocumentStatus, STATUS_LABELS } from '@/lib/documents/status';
import type { WorkerWithDocuments, HeavyEquipment } from '@/types';

function statusColor(status: string): string {
  if (status === 'תקין') return '#16a34a';
  if (status === 'עומד לפוג') return '#d97706';
  return '#dc2626';
}

function buildWorkersHtml(workers: WorkerWithDocuments[], title: string): string {
  const rows = workers.map((w) => {
    const idDoc = w.documents.find((d) => d.doc_type === 'id_document');
    const visa = w.documents.find((d) => d.doc_type === 'work_visa');
    const hp = w.documents.find((d) => d.doc_type === 'height_permit');
    const briefing = w.safety_briefings?.[0] ?? null;

    const heightStatus = STATUS_LABELS[getDocumentStatus(hp?.file_url ?? null, hp?.expiry_date ?? null)];
    const visaStatus = w.is_foreign_worker
      ? STATUS_LABELS[getDocumentStatus(visa?.file_url ?? null, visa?.expiry_date ?? null)]
      : '—';
    const briefingStatus = briefing
      ? STATUS_LABELS[getDocumentStatus(briefing.file_url, briefing.expires_at)]
      : 'חסר';

    return `
      <tr>
        <td>${w.full_name}</td>
        <td dir="ltr">${getWorkerIdentifierValue(w)}</td>
        <td>${w.is_foreign_worker ? 'זר' : 'ישראלי'}</td>
        <td>${w.subcontractor?.name ?? '—'}</td>
        <td>${w.project_name ?? '—'}</td>
        <td style="color:${statusColor(heightStatus)};font-weight:600">${heightStatus}</td>
        <td style="color:${statusColor(visaStatus)};font-weight:600">${visaStatus}</td>
        <td style="color:${statusColor(briefingStatus)};font-weight:600">${briefingStatus}</td>
        <td>${w.is_active ? 'פעיל' : 'לא פעיל'}</td>
      </tr>`;
  }).join('');

  const headers = ['שם מלא', 'מספר מזהה', 'סוג', 'קבלן משנה', 'פרויקט', 'עבודה בגובה', 'אשרת עבודה', 'תדריך', 'סטטוס'];

  return buildHtmlShell(title, headers, rows);
}

function buildEquipmentHtml(equipment: HeavyEquipment[], title: string): string {
  const rows = equipment.map((eq) => {
    const licStatus = STATUS_LABELS[getDocumentStatus(eq.license_file_url, eq.license_expiry)];
    const insStatus = STATUS_LABELS[getDocumentStatus(eq.insurance_file_url, eq.insurance_expiry)];

    return `
      <tr>
        <td>${eq.description}</td>
        <td dir="ltr">${eq.license_number ?? '—'}</td>
        <td>${eq.subcontractor?.name ?? '—'}</td>
        <td>${eq.project_name ?? '—'}</td>
        <td style="color:${statusColor(licStatus)};font-weight:600">${licStatus}</td>
        <td style="color:${statusColor(insStatus)};font-weight:600">${insStatus}</td>
        <td>${eq.license_expiry ?? '—'}</td>
        <td>${eq.insurance_expiry ?? '—'}</td>
        <td>${eq.is_active ? 'פעיל' : 'לא פעיל'}</td>
      </tr>`;
  }).join('');

  const headers = ['תיאור', 'מספר רישוי', 'קבלן משנה', 'פרויקט', 'רישיון', 'ביטוח', 'תוקף רישיון', 'תוקף ביטוח', 'סטטוס'];
  return buildHtmlShell(title, headers, rows);
}

function buildHtmlShell(title: string, headers: string[], rows: string): string {
  const today = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const headerCells = headers.map((h) => `<th>${h}</th>`).join('');

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8" />
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Heebo', Arial, sans-serif; direction: rtl; background: white; color: #1e293b; padding: 24px; font-size: 12px; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #ea580c; padding-bottom: 12px; margin-bottom: 16px; }
        .logo { width: 56px; height: 56px; object-fit: contain; }
        .company { text-align: right; }
        .company h1 { font-size: 18px; font-weight: 700; color: #1e293b; }
        .company p { font-size: 12px; color: #64748b; }
        .report-title { font-size: 16px; font-weight: 700; color: #ea580c; margin-bottom: 4px; }
        .report-date { font-size: 11px; color: #94a3b8; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #f1f5f9; padding: 8px 6px; text-align: right; font-weight: 600; border: 1px solid #e2e8f0; color: #475569; }
        td { padding: 7px 6px; border: 1px solid #e2e8f0; text-align: right; vertical-align: middle; }
        tr:nth-child(even) td { background: #f8fafc; }
        .footer { margin-top: 16px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company">
          <div class="report-title">${title}</div>
          <p>סה"כ: ${rows.split('<tr>').length - 1} רשומות</p>
        </div>
        <div style="text-align:center">
          <img src="/company-logo.png" class="logo" />
          <div class="company"><h1>נתן ולדמן ובניו בע"מ</h1><p>ניהול בטיחות</p></div>
        </div>
      </div>
      <div class="report-date">תאריך הפקה: ${today}</div>
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">SafeDoc · נתן ולדמן ובניו בע"מ · הופק ב-${today}</div>
    </body>
    </html>`;
}

export async function generatePdf(
  html: string,
  filename: string,
): Promise<void> {
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
      let y = 0;
      let remaining = imgH;
      while (remaining > 0) {
        const slice = Math.min(pageH, remaining);
        const srcY = ((imgH - remaining) / imgH) * canvas.height;
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = (slice / imgH) * canvas.height;
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, srcY, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
        if (y > 0) pdf.addPage();
        pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, slice);
        remaining -= pageH;
        y += pageH;
      }
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

export { buildWorkersHtml, buildEquipmentHtml };
