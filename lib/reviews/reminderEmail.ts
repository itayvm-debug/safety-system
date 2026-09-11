import { weekLabel } from './week';

export function buildReviewReminderHtml(
  companyName: string,
  weekStart: string,
  totalWorkers: number,
  submittedCount: number,
  appUrl: string,
): string {
  const remaining = totalWorkers - submittedCount;
  const pct = totalWorkers > 0 ? Math.round((submittedCount / totalWorkers) * 100) : 0;
  const reviewUrl = `${appUrl}/reviews`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"/><title>תזכורת הגשת ביצועים</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
<div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
  <div style="background:#f97316;padding:20px 24px;">
    <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">SafeDoc — ביצועי עובדים</p>
    <p style="margin:4px 0 0;color:#fed7aa;font-size:13px;">${companyName}</p>
  </div>
  <div style="padding:24px;">
    <p style="font-size:15px;color:#111;margin:0 0 12px;">שלום,</p>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">
      תזכורת להגשת ביצועי עובדים עבור <strong>${weekLabel(weekStart)}</strong>.
    </p>

    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:13px;color:#6b7280;">הוגשו</span>
        <span style="font-size:13px;font-weight:700;color:#16a34a;">${submittedCount} / ${totalWorkers}</span>
      </div>
      <div style="background:#e5e7eb;border-radius:4px;height:8px;">
        <div style="background:#f97316;border-radius:4px;height:8px;width:${pct}%;"></div>
      </div>
      ${remaining > 0
        ? `<p style="margin:8px 0 0;font-size:12px;color:#6b7280;">נותרו ${remaining} עובדים להגשה.</p>`
        : `<p style="margin:8px 0 0;font-size:12px;color:#16a34a;font-weight:600;">כל הביצועים הוגשו!</p>`
      }
    </div>

    ${remaining > 0 ? `
    <a href="${reviewUrl}"
       style="display:block;text-align:center;background:#f97316;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      לצפייה ועדכון ביצועים
    </a>` : ''}
  </div>
  <div style="padding:12px 24px;border-top:1px solid #f3f4f6;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">SafeDoc — ניהול בטיחות</p>
  </div>
</div>
</body>
</html>`;
}

export function buildReviewReminderSubject(companyName: string, weekStart: string): string {
  return `[SafeDoc] תזכורת ביצועי עובדים — ${weekLabel(weekStart)} | ${companyName}`;
}

export function buildWhatsAppReminderTemplate(
  companyName: string,
  weekStart: string,
  remaining: number,
  appUrl: string,
): string {
  return `*SafeDoc — תזכורת ביצועי עובדים*
חברה: ${companyName}
שבוע: ${weekLabel(weekStart)}

נותרו ${remaining} עובדים להגשת ביצועים.

לכניסה למערכת: ${appUrl}/reviews`.trim();
}
