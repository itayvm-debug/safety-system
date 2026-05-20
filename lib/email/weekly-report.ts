import type { Issue } from '@/lib/documents/issues';

// ── Constants ────────────────────────────────────────────────────────────────

const LABEL: Record<string, string> = {
  expired: 'פג תוקף',
  missing: 'חסר',
  expiring_soon: 'עומד לפוג',
};

// Used only for sorting within sections — does not replace STATUS_SEVERITY in status.ts
const SORT_SEVERITY: Record<string, number> = { expired: 2, missing: 2, expiring_soon: 1 };

// ── Category definitions ─────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function isUrgent(status: string): boolean {
  return status === 'expired' || status === 'missing';
}

function statusBadge(status: string): string {
  if (isUrgent(status)) {
    return `<span style="background:#fef2f2;color:#dc2626;padding:2px 9px;border-radius:10px;font-size:12px;font-weight:700">${LABEL[status]}</span>`;
  }
  return `<span style="background:#fffbeb;color:#d97706;padding:2px 9px;border-radius:10px;font-size:12px;font-weight:700">${LABEL[status] ?? status}</span>`;
}

// ── Section builder ──────────────────────────────────────────────────────────
// One flat row per issue (entity name may repeat) — avoids deeply nested tables.
// Rows sorted: urgent first, then expiring_soon.

function buildCategorySection(cat: Category, issues: Issue[], appUrl: string): string {
  const catIssues = filterCategory(issues, cat);
  if (catIssues.length === 0) return '';

  const sorted = [...catIssues].sort(
    (a, b) => (SORT_SEVERITY[b.status] ?? 0) - (SORT_SEVERITY[a.status] ?? 0)
  );

  const urgentCount  = sorted.filter((i) => isUrgent(i.status)).length;
  const expiringCount = sorted.filter((i) => i.status === 'expiring_soon').length;

  const headerBadges = [
    urgentCount  > 0 ? `<span style="background:#dc2626;color:#fff;padding:2px 9px;border-radius:10px;font-size:12px;font-weight:700">${urgentCount} לא תקין</span>`   : '',
    expiringCount > 0 ? `<span style="background:#d97706;color:#fff;padding:2px 9px;border-radius:10px;font-size:12px;font-weight:700">${expiringCount} עומד לפוג</span>` : '',
  ].filter(Boolean).join('&nbsp;');

  const rows = sorted.map((issue) => {
    const sub = issue.subcontractorName
      ? `<span style="font-size:11px;font-weight:400;color:#9ca3af;margin-right:6px">${issue.subcontractorName}</span>`
      : '';
    return `<tr>
<td style="padding:8px 14px;border-top:1px solid #f3f4f6;font-size:13px;font-weight:600;color:#111827;width:40%"><a href="${appUrl}${issue.href}" style="color:#111827;text-decoration:none">${issue.entityName}</a>${sub}</td>
<td style="padding:8px 14px;border-top:1px solid #f3f4f6;font-size:13px;color:#4b5563">${issue.problem}</td>
<td style="padding:8px 14px;border-top:1px solid #f3f4f6;text-align:left;white-space:nowrap">${statusBadge(issue.status)}</td>
</tr>`;
  }).join('');

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:#1f2937;padding:10px 14px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="color:#fff;font-weight:700;font-size:14px">${cat.label}</td><td style="text-align:left">${headerBadges}</td></tr></table></td></tr>
<tr><td><table width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>
</table>`;
}

// ── Main export ──────────────────────────────────────────────────────────────

export function buildWeeklyReportHtml(issues: Issue[], appUrl: string): string {
  const urgentTotal   = issues.filter((i) => isUrgent(i.status)).length;
  const expiringTotal = issues.filter((i) => i.status === 'expiring_soon').length;
  const total = urgentTotal + expiringTotal;

  const dateStr = new Date().toLocaleDateString('he-IL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  if (urgentTotal === 0 && expiringTotal === 0) {
    return buildAllClearHtml(dateStr, appUrl);
  }

  const sections = CATEGORIES.map((cat) => buildCategorySection(cat, issues, appUrl)).join('');

  const summary = `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="text-align:center;padding:14px 0"><div style="font-size:30px;font-weight:800;color:#374151;line-height:1">${total}</div><div style="font-size:12px;color:#6b7280;margin-top:3px">סה"כ ליקויים</div></td>
<td style="width:1px;background:#e5e7eb"></td>
<td style="text-align:center;padding:14px 0"><div style="font-size:30px;font-weight:800;color:#dc2626;line-height:1">${urgentTotal}</div><div style="font-size:12px;color:#dc2626;margin-top:3px">לא תקינים</div></td>
<td style="width:1px;background:#e5e7eb"></td>
<td style="text-align:center;padding:14px 0"><div style="font-size:30px;font-weight:800;color:#d97706;line-height:1">${expiringTotal}</div><div style="font-size:12px;color:#d97706;margin-top:3px">עומדים לפוג</div></td>
<td style="width:1px;background:#e5e7eb"></td>
<td style="text-align:center;padding:14px 16px"><div style="font-size:13px;font-weight:600;color:#374151">${dateStr}</div><div style="font-size:11px;color:#9ca3af;margin-top:3px">תאריך יצירה</div></td>
</tr></table>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>דוח שבועי SafeDoc</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;direction:rtl">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">

<tr><td style="background:#ea580c;border-radius:14px 14px 0 0;padding:24px;text-align:center">
<div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px">SafeDoc</div>
<div style="font-size:12px;color:#fed7aa;margin-top:3px">דוח סטטוס שבועי</div>
</td></tr>

<tr><td style="background:#fff;border-right:1px solid #e5e7eb;border-left:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">
${summary}
</td></tr>

<tr><td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 14px 14px;padding:20px 16px 8px">
${sections}
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="text-align:center;padding:16px 0 24px">
<a href="${appUrl}" style="background:#ea580c;color:#fff;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;display:inline-block">פתח SafeDoc לטיפול בליקויים ←</a>
</td></tr>
</table>
</td></tr>

<tr><td style="text-align:center;padding:16px;color:#9ca3af;font-size:12px">
<p style="margin:0">מייל זה נשלח אוטומטית ממערכת SafeDoc</p>
<p style="margin:4px 0 0">לשינוי הגדרות דוח, פנה לאדמין של המערכת</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── All-clear variant ────────────────────────────────────────────────────────

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
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">
<tr><td style="background:#ea580c;border-radius:14px 14px 0 0;padding:24px;text-align:center">
<div style="font-size:28px;font-weight:800;color:#fff">SafeDoc</div>
<div style="font-size:12px;color:#fed7aa;margin-top:3px">דוח סטטוס שבועי</div>
</td></tr>
<tr><td style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 14px 14px;padding:40px 28px;text-align:center">
<div style="font-size:48px;margin-bottom:12px">&#x2705;</div>
<div style="font-size:22px;font-weight:800;color:#16a34a">הכל תקין!</div>
<div style="font-size:12px;color:#6b7280;margin-top:6px">${dateStr}</div>
<div style="font-size:14px;color:#374151;margin-top:14px">לא נמצאו ליקויים פעילים במערכת</div>
<div style="margin-top:24px"><a href="${appUrl}" style="background:#ea580c;color:#fff;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;display:inline-block">פתח SafeDoc ←</a></div>
</td></tr>
<tr><td style="text-align:center;padding:16px;color:#9ca3af;font-size:12px">
<p style="margin:0">מייל זה נשלח אוטומטית ממערכת SafeDoc</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
