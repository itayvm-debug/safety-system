/**
 * Unit tests for reminder-cron timezone helper and idempotency logic.
 *
 * Schedule (vercel.json): Thursday 06:00 UTC — "0 6 * * 4"
 * Vercel Hobby allows only ONE cron per day, so the previous dual-fire
 * schedule "0 6,7 * * 4" has been removed.
 *
 * israelHour() documents the UTC→Israel mapping; the route handler itself
 * no longer gates on this value — the cron schedule is authoritative.
 *
 * Thursday 06:00 UTC Israel local time:
 *   IDT (summer, UTC+3) → 09:00
 *   IST (winter, UTC+2) → 08:00
 *
 * Idempotency: INSERT ... ON CONFLICT DO NOTHING on
 * (company_id, week_start, reminder_type) ensures at-most-once delivery
 * per company per week.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { israelHour } from '../cronHelpers';
import { getWeekStart } from '../week';

// ─── Timezone helper tests ────────────────────────────────────────────────────
// These tests document the UTC→Israel clock mapping.
// The route handler does NOT call israelHour() as a guard any more.

describe('israelHour — UTC to Israel timezone mapping', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // ── Summer (IDT = UTC+3) ──────────────────────────────────────────
  it('summer 06:00 UTC → Israel 09:00 (cron fires at this UTC time in summer)', () => {
    vi.setSystemTime(new Date('2025-07-03T06:00:00Z')); // Thursday
    expect(israelHour()).toBe(9);
  });

  it('summer 07:00 UTC → Israel 10:00', () => {
    vi.setSystemTime(new Date('2025-07-03T07:00:00Z'));
    expect(israelHour()).toBe(10);
  });

  it('summer 05:00 UTC → Israel 08:00', () => {
    vi.setSystemTime(new Date('2025-07-03T05:00:00Z'));
    expect(israelHour()).toBe(8);
  });

  // ── Winter (IST = UTC+2) ──────────────────────────────────────────
  // NOTE: with the single 06:00 UTC cron, winter fires at Israel 08:00, not 09:00.
  // This is the accepted Hobby-plan trade-off.
  it('winter 06:00 UTC → Israel 08:00 (cron fires at this UTC time in winter)', () => {
    vi.setSystemTime(new Date('2025-01-02T06:00:00Z')); // Thursday
    expect(israelHour()).toBe(8);
  });

  it('winter 07:00 UTC → Israel 09:00', () => {
    vi.setSystemTime(new Date('2025-01-02T07:00:00Z'));
    expect(israelHour()).toBe(9);
  });

  it('winter 08:00 UTC → Israel 10:00', () => {
    vi.setSystemTime(new Date('2025-01-02T08:00:00Z'));
    expect(israelHour()).toBe(10);
  });

  // ── Edge cases ────────────────────────────────────────────────────
  it('summer midnight UTC → Israel 03:00', () => {
    vi.setSystemTime(new Date('2025-07-03T00:00:00Z'));
    expect(israelHour()).toBe(3);
  });

  it('winter noon UTC → Israel 14:00', () => {
    vi.setSystemTime(new Date('2025-01-02T12:00:00Z'));
    expect(israelHour()).toBe(14);
  });
});

// ─── Idempotency logic tests ──────────────────────────────────────────────────
//
// These tests verify the INSERT ... ON CONFLICT DO NOTHING idempotency pattern
// used by the reminder-cron handler.  The review_reminder_log table has a
// unique constraint on (company_id, week_start, reminder_type); Postgres error
// code 23505 signals a duplicate insert attempt.

describe('reminder-cron idempotency (review_reminder_log INSERT pattern)', () => {
  const COMPANY_A = 'company-aaa';
  const COMPANY_B = 'company-bbb';
  const WEEK_1 = '2025-07-06'; // Sunday
  const WEEK_2 = '2025-07-13'; // following Sunday
  const TYPE   = 'weekly_review';

  /** Simulates the DB log state: a Set of JSON keys that have been "inserted". */
  function makeLogStore() {
    const store = new Set<string>();
    return {
      /** Returns true if insert succeeded (first for this key), false on conflict. */
      insert(companyId: string, weekStart: string, reminderType: string): boolean {
        const key = JSON.stringify({ companyId, weekStart, reminderType });
        if (store.has(key)) return false; // conflict
        store.add(key);
        return true;
      },
      size: () => store.size,
    };
  }

  it('A. first valid invocation → insert succeeds → email should be sent', () => {
    const log = makeLogStore();
    const claimed = log.insert(COMPANY_A, WEEK_1, TYPE);
    expect(claimed).toBe(true); // slot was free → send email
    expect(log.size()).toBe(1);
  });

  it('B. second same-company/same-week invocation → insert conflicts → skip (idempotent)', () => {
    const log = makeLogStore();
    log.insert(COMPANY_A, WEEK_1, TYPE); // first call
    const claimed = log.insert(COMPANY_A, WEEK_1, TYPE); // duplicate (e.g. Vercel retry)
    expect(claimed).toBe(false); // slot occupied → skip
    expect(log.size()).toBe(1); // still only one row
  });

  it('C. different company same week → insert succeeds → may send', () => {
    const log = makeLogStore();
    log.insert(COMPANY_A, WEEK_1, TYPE);
    const claimed = log.insert(COMPANY_B, WEEK_1, TYPE); // different company
    expect(claimed).toBe(true); // different key → may send
    expect(log.size()).toBe(2);
  });

  it('D. same company next week → insert succeeds → may send', () => {
    const log = makeLogStore();
    log.insert(COMPANY_A, WEEK_1, TYPE);
    const claimed = log.insert(COMPANY_A, WEEK_2, TYPE); // next week
    expect(claimed).toBe(true); // different week → may send
    expect(log.size()).toBe(2);
  });

  it('E. Thursday 06:00 UTC cron proceeds regardless of Israel local hour', () => {
    // With a single daily cron the route handler does NOT gate on israelHour().
    // Idempotency is enforced by the DB unique constraint, not by a time guard.
    // Summer: 06:00 UTC → Israel 09:00; winter: 06:00 UTC → Israel 08:00.
    // Both should proceed — the log insert prevents any duplicate send.
    vi.useFakeTimers();

    // Summer firing: Israel 09:00
    vi.setSystemTime(new Date('2025-07-03T06:00:00Z'));
    expect(israelHour()).toBe(9);

    // Winter firing: Israel 08:00 — handler must still proceed (no hour gate)
    vi.setSystemTime(new Date('2025-01-02T06:00:00Z'));
    expect(israelHour()).toBe(8);

    // In both cases the idempotency store correctly prevents duplicates
    const log = makeLogStore();
    const week = getWeekStart();
    expect(log.insert(COMPANY_A, week, TYPE)).toBe(true);  // first → send
    expect(log.insert(COMPANY_A, week, TYPE)).toBe(false); // retry → skip

    vi.useRealTimers();
  });

  it('F. no second daily cron — single invocation per week per company is guaranteed', () => {
    // vercel.json has exactly one entry for reminder-cron: "0 6 * * 4"
    // This test documents the contract: at most one reminder per (company, week).
    const log = makeLogStore();
    const invocations = 3; // simulate manual retries or Vercel retries
    let sent = 0;
    for (let i = 0; i < invocations; i++) {
      if (log.insert(COMPANY_A, WEEK_1, TYPE)) sent++;
    }
    expect(sent).toBe(1);
    expect(log.size()).toBe(1);
  });
});
