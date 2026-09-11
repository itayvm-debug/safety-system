import type { PdfBranding } from '@/lib/export/generatePdf';
import { weekLabel } from './week';

export type ReviewScope = 'company' | 'manager' | 'individual';

export interface ReviewReportRow {
  worker_id:            string;
  worker_name:          string;
  manager_name:         string | null;
  week_start:           string;
  productivity_rating:  number | null;
  quality_rating:       number | null;
  reliability_rating:   number | null;
  discipline_rating:    number | null;
  teamwork_rating:      number | null;
  safety_rating:        number | null;
  is_not_evaluable:     boolean;
  not_evaluable_reason: string | null;
  manager_comment:      string | null;
  avg_rating:           number | null;
}

const RATING_LABELS: Record<string, string> = {
  productivity_rating: 'פרודוקטיביות',
  quality_rating:      'איכות עבודה',
  reliability_rating:  'אמינות',
  discipline_rating:   'משמעת',
  teamwork_rating:     'עבודת צוות',
  safety_rating:       'בטיחות',
};

const RATING_FIELDS = [
  'productivity_rating', 'quality_rating', 'reliability_rating',
  'discipline_rating', 'teamwork_rating', 'safety_rating',
] as const;

function ratingCell(val: number | null): string {
  if (val === null) return '<span style="color:#9ca3af">—</span>';
  const color = val >= 4 ? '#16a34a' : val === 3 ? '#d97706' : '#dc2626';
  return `<span style="color:${color};font-weight:600">${val}</span>`;
}

function avgCell(val: number | null): string {
  if (val === null) return '<span style="color:#9ca3af">—</span>';
  const color = val >= 4 ? '#16a34a' : val >= 3 ? '#d97706' : '#dc2626';
  return `<span style="color:${color};font-weight:700">${val.toFixed(1)}</span>`;
}

export function generateReviewReportHtml(
  rows: ReviewReportRow[],
  branding: PdfBranding,
  weekStart: string,
  scope: ReviewScope,
  scopeLabel: string,
): string {
  const title = `דוח ביצועי עובדים — ${scopeLabel} — ${weekLabel(weekStart)}`;

  const tableRows = rows.map(r => {
    const ratingCells = r.is_not_evaluable
      ? `<td colspan="7" style="text-align:center;color:#6b7280;font-size:11px">לא ניתן להעריך${r.not_evaluable_reason ? ` — ${r.not_evaluable_reason}` : ''}</td>`
      : RATING_FIELDS.map(f => `<td style="text-align:center">${ratingCell(r[f])}</td>`).join('') +
        `<td style="text-align:center">${avgCell(r.avg_rating)}</td>`;

    return `
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:6px 8px;font-weight:500">${r.worker_name}</td>
        <td style="padding:6px 8px;color:#6b7280;font-size:11px">${r.manager_name ?? '—'}</td>
        ${ratingCells}
        <td style="padding:6px 8px;font-size:10px;color:#6b7280;max-width:120px">${r.manager_comment ?? ''}</td>
      </tr>`;
  }).join('');

  const headerCells = RATING_FIELDS.map(f =>
    `<th style="padding:6px 8px;text-align:center;white-space:nowrap">${RATING_LABELS[f]}</th>`
  ).join('') + `<th style="padding:6px 8px;text-align:center">ממוצע</th>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  * { font-family: 'Arial', sans-serif; font-size: 12px; }
  body { margin: 20px; color: #111; }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #f97316; }
  .logo { width: 40px; height: 40px; object-fit: contain; }
  h1 { font-size: 16px; font-weight: 700; margin: 0; }
  .subtitle { font-size: 11px; color: #6b7280; margin: 2px 0 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #f9fafb; padding: 6px 8px; text-align: right; color: #374151; font-weight: 600; font-size: 11px; border-bottom: 2px solid #e5e7eb; }
  td { padding: 6px 8px; font-size: 11px; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  .footer { margin-top: 20px; font-size: 10px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
<div class="header">
  ${branding.logoUrl ? `<img class="logo" src="${branding.logoUrl}" alt="" />` : ''}
  <div>
    <h1>${title}</h1>
    <p class="subtitle">${branding.companyName} | הופק: ${new Date().toLocaleDateString('he-IL')}</p>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th>שם עובד</th>
      <th>מנהל מעריך</th>
      ${headerCells}
      <th>הערת מנהל</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="footer">SafeDoc — ניהול בטיחות | סה"כ ${rows.length} עובדים</div>
</body>
</html>`;
}
