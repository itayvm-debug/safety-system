/**
 * Returns the current wall-clock hour (0–23) in Israel time (Asia/Jerusalem).
 * Israel uses IDT (UTC+3) in summer and IST (UTC+2) in winter.
 * By firing the cron at both 06:00 UTC and 07:00 UTC on Thursday, exactly
 * one firing lands at Israel 09:xx regardless of DST offset.
 */
export function israelHour(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  return parseInt(parts.find(p => p.type === 'hour')!.value, 10);
}
