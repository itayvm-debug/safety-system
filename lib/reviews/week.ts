/**
 * Israeli business week starts on Sunday.
 * week_start is always the Sunday DATE of the current/given week.
 */

/** Returns the ISO date string (YYYY-MM-DD) for the Sunday that starts the week
 *  containing the given date (or today if no date is provided). */
export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sunday, 1=Mon, ..., 6=Sat
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/** Returns the ISO date string for the Sunday that starts the *previous* week. */
export function getPreviousWeekStart(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day - 7);
  return d.toISOString().slice(0, 10);
}

/** Returns a human-readable Hebrew label for the week, e.g. "שבוע 14/09/2025". */
export function weekLabel(weekStart: string): string {
  const [y, m, day] = weekStart.split('-');
  return `שבוע ${day}/${m}/${y}`;
}

/** Returns true if the given ISO date string is the start of the current week. */
export function isCurrentWeek(weekStart: string): boolean {
  return weekStart === getWeekStart();
}
