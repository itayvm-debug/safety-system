import type { Issue } from '@/lib/documents/issues';

const STATUS_LABEL: Record<string, string> = {
  expired: 'פג תוקף',
  missing: 'חסר',
  expiring_soon: 'עומד לפוג',
};

const STATUS_COLOR: Record<string, string> = {
  expired: '#dc2626',
  missing: '#dc2626',
  expiring_soon: '#d97706',
};

const STATUS_BG: Record<string, string> = {
  expired: '#fef2f2',
  missing: '#fef2f2',
  expiring_soon: '#fffbeb',
};

interface Category {
  label: string;
  entityType: Issue['entityType'];
  managerOnly?: boolean;
  nonManagerOnly?: boolean;
}

const CATEGORIES: Category[] = [
  { label: 'עובדים',       entityType: 'worker',           nonManagerOnly: true },
  { label: 'מנהלי עבודה', entityType: 'worker',           managerOnly: true },
  { label: 'רכבים',        entityType: 'vehicle' },
  { label: 'כלי צמ"ה',   entityType: 'heavy_equipment' },
  { label: 'ציוד הרמה',   entityType: 'lifting_equipment' },
];

function filterCategory(issues: Issue[], cat: Category): Issue[] {
  return issues.filter((i) => {
    if (i.entityType !== cat.entityType) return false;
    if (cat.entityType === 'worker') {
      if (cat.managerOnly) return i.isManager;
      if (cat.nonManagerOnly) return !i.isManager;
    }
    return true;
  });
}

interface EntityGroup {
  name: string;
  href: string;
  subcontractorName: string | null;
  problems: Array<{ problem: string; status: string }>;
}

function groupByEntity(issues: Issue[]): EntityGroup[] {
  const map = new Map<string, EntityGroup>();
  for (const issue of issues) {
    if (!map.has(issue.entityId)) {
      map.set(issue.entityId, {
        name: issue.entityName,
        href: issue.href,
        subcontractorName: issue.subcontractorName ?? null,
        problems: [],
      });
    }
    map.get(issue.entityId)!.problems.push({ problem: issue.problem, status: issue.status });
  }
  return Array.from(map.values());
}

function isUrgent(status: string) {
  return status === 'expired' || status === 'missing';
}

function buildCategorySection(cat: Category, issues: Issue[], appUrl: string): string {
  const catIssues = filterCategory(issues, cat);
  if (catIssues.length === 0) return '';

  const urgentCount = catIssues.filter((i) => isUrgent(i.status)).length;
  const expiringCount = catIssues.filter((i) => i.status === 'expiring_soon').length;

  const badges = [
    urgentCount > 0
      ? `<span style="background:#fef2f2;color:#dc2626;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:700;white-space:nowrap">${urgentCount} לא תקין</span>`
      : '',
    expiringCount > 0
      ? `<span style="background:#fffbeb;color:#d97706;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:700;white-space:nowrap">${expiringCount} עומד לפוג</span>`
      : '',
  ].filter(Boolean).join('&nbsp;');

  const entities = groupByEntity(catIssues);

  const entityRows = entities.map((e) => {
    const problemsHtml = e.problems.map((p) =>
      `<tr>
        <td style="padding:3px 0;font-size:13px;color:#4b5563">${p.problem}</td>
        <td style="padding:3px 0;text-align:left;white-space:nowrap">
          <span style="background:${STATUS_BG[p.status]};color:${STATUS_COLOR[p.status]};padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600">
            ${STATUS_LABEL[p.status] ?? p.status}
          </span>
        </td>
      </tr>`
    ).join('');

    const subLabel = e.subcontractorName
      ? `<span style="font-size:12px;color:#9ca3af;margin-right:6px">${e.subcontractorName}</span>`
      : '';

    return `<tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f3f4f6">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-bottom:6px">
              <a href="${appUrl}${e.href}" style="font-weight:700;font-size:14px;color:#111827;text-decoration:none">${e.name}</a>
              ${subLabel}
            </td>
          </tr>
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${problemsHtml}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px">
      <tr>
        <td style="padding:0 0 8px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-weight:700;font-size:15px;color:#111827">${cat.label}</td>
              <td style="text-align:left">${badges}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${entityRows}
          </table>
        </td>
      </tr>
    </table>`;
}

export function buildWeeklyReportHtml(issues: Issue[], appUrl: string): string {
  const urgentTotal = issues.filter((i) => isUrgent(i.status)).length;
  const expiringTotal = issues.filter((i) => i.status === 'expiring_soon').length;

  const dateStr = new Date().toLocaleDateString('he-IL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  if (urgentTotal === 0 && expiringTotal === 0) {
    return buildAllClearHtml(dateStr, appUrl);
  }

  const categorySections = CATEGORIES
    .map((cat) => buildCategorySection(cat, issues, appUrl))
    .join('');

  const summaryBlocks = [
    urgentTotal > 0
      ? `<td style="text-align:center;padding:0 20px">
           <div style="font-size:36px;font-weight:800;color:#dc2626;line-height:1">${urgentTotal}</div>
           <div style="font-size:13px;font-weight:600;color:#dc2626;margin-top:4px">ליקויים דחופים</div>
         </td>`
      : '',
    urgentTotal > 0 && expiringTotal > 0
      ? `<td style="width:1px;background:#e5e7eb;padding:0"></td>`
      : '',
    expiringTotal > 0
      ? `<td style="text-align:center;padding:0 20px">
           <div style="font-size:36px;font-weight:800;color:#d97706;line-height:1">${expiringTotal}</div>
           <div style="font-size:13px;font-weight:600;color:#d97706;margin-top:4px">עומדים לפוג</div>
         </td>`
      : '',
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>דוח סטטוס שבועי SafeDoc</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;direction:rtl">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">

          <!-- Header -->
          <tr>
            <td style="background:#ea580c;border-radius:16px 16px 0 0;padding:28px;text-align:center">
              <div style="font-size:30px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">SafeDoc</div>
              <div style="font-size:13px;color:#fed7aa;margin-top:4px">מערכת ניהול בטיחות באתרי בנייה</div>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="background:#ffffff;border-right:1px solid #e5e7eb;border-left:1px solid #e5e7eb;padding:20px 28px 16px">
              <div style="font-size:20px;font-weight:700;color:#111827">דוח סטטוס שבועי</div>
              <div style="font-size:13px;color:#6b7280;margin-top:4px">${dateStr}</div>
            </td>
          </tr>

          <!-- Summary -->
          <tr>
            <td style="background:#fff7ed;border:1px solid #e5e7eb;border-top:none;padding:20px 28px">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr align="center">
                  ${summaryBlocks}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:24px 20px 8px">
              ${categorySections}

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="text-align:center;padding:16px 0 24px">
                    <a href="${appUrl}" style="display:inline-block;background:#ea580c;color:#ffffff;padding:13px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none">
                      פתח את SafeDoc לטיפול בליקויים ←
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="text-align:center;padding:20px;color:#9ca3af;font-size:12px">
              <p style="margin:0">מייל זה נשלח אוטומטית ממערכת SafeDoc</p>
              <p style="margin:4px 0 0">לשינוי הגדרות דוח, פנה לאדמין של המערכת</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildAllClearHtml(dateStr: string, appUrl: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>דוח שבועי SafeDoc</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;direction:rtl">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">
          <tr>
            <td style="background:#ea580c;border-radius:16px 16px 0 0;padding:28px;text-align:center">
              <div style="font-size:30px;font-weight:800;color:#ffffff">SafeDoc</div>
              <div style="font-size:13px;color:#fed7aa;margin-top:4px">מערכת ניהול בטיחות באתרי בנייה</div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:40px 28px;text-align:center">
              <div style="font-size:56px;margin-bottom:16px">&#x2705;</div>
              <div style="font-size:22px;font-weight:800;color:#16a34a">הכל תקין!</div>
              <div style="font-size:13px;color:#6b7280;margin-top:8px">${dateStr}</div>
              <div style="font-size:15px;color:#374151;margin-top:16px">לא נמצאו ליקויים פעילים במערכת</div>
              <div style="margin-top:28px">
                <a href="${appUrl}" style="display:inline-block;background:#ea580c;color:#ffffff;padding:13px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none">
                  פתח SafeDoc ←
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="text-align:center;padding:20px;color:#9ca3af;font-size:12px">
              <p style="margin:0">מייל זה נשלח אוטומטית ממערכת SafeDoc</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
