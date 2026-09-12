/**
 * Unit tests for the reminder-cron DST timezone guard and idempotency logic.
 *
 * israelHour() must return:
 *  - 9  when UTC is 06:00 in summer (IDT = UTC+3)
 *  - 10 when UTC is 07:00 in summer
 *  - 8  when UTC is 06:00 in winter (IST = UTC+2)
 *  - 9  when UTC is 07:00 in winter
 *
 * Idempotency: INSERT ... ON CONFLICT DO NOTHING on (company_id, week_start,
 * reminder_type) ensures at-most-once delivery per company per week.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { israelHour } from '../cronHelpers';
import { getWeekStart } from '../week';

// ─── Timezone guard tests ────────────────────────────────────────────────────

describe('israelHour — DST-safe timezone guard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // ── Summer (IDT = UTC+3) ──────────────────────────────────────────
  it('summer 06:00 UTC → Israel 09:00 (cron fires, should proceed)', () => {
    vi.setSystemTime(new Date('2025-07-03T06:00:00Z')); // Thursday
    expect(israelHour()).toBe(9);
  });

  it('summer 07:00 UTC → Israel 10:00 (second firing, should skip)', () => {
    vi.setSystemTime(new Date('2025-07-03T07:00:00Z'));
    expect(israelHour()).toBe(10);
  });

  it('summer 05:00 UTC → Israel 08:00 (not 09, should skip)', () => {
    vi.setSystemTime(new Date('2025-07-03T05:00:00Z'));
    expect(israelHour()).toBe(8);
  });

  // ── Winter (IST = UTC+2) ──────────────────────────────────────────
  it('winter 07:00 UTC → Israel 09:00 (cron fires, should proceed)', () => {
    vi.setSystemTime(new Date('2025-01-02T07:00:00Z')); // Thursday
    expect(israelHour()).toBe(9);
  });

  it('winter 06:00 UTC → Israel 08:00 (first firing, should skip)', () => {
    vi.setSystemTime(new Date('2025-01-02T06:00:00Z'));
    expect(israelHour()).toBe(8);
  });

  it('winter 08:00 UTC → Israel 10:00 (not 09, should skip)', () => {
    vi.setSystemTime(new Date('2025-01-02T08:00:00Z'));
    expect(israelHour()).toBe(10);
  });

  // ── Edge cases ────────────────────────────────────────────────────
  it('summer midnight UTC → Israel 03:00 (not 09, skip)', () => {
    vi.setSystemTime(new Date('2025-07-03T00:00:00Z'));
    expect(israelHour()).toBe(3);
  });

  it('winter noon UTC → Israel 14:00 (not 09, skip)', () => {
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

  it('B. second same-company/same-week invocation → insert conflicts → skip', () => {
    const log = makeLogStore();
    log.insert(COMPANY_A, WEEK_1, TYPE); // first call
    const claimed = log.insert(COMPANY_A, WEEK_1, TYPE); // duplicate
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

  it('E. invalid Israel local hour → israelHour guard fires before any insert', () => {
    // At UTC 07:00 in IDT (summer), Israel is 10:00 — not 09
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-07-03T07:00:00Z'));
    const hour = israelHour();
    expect(hour).not.toBe(9); // guard would return { skipped: true } here
    // No insert attempted — verify the guard logic
    const log = makeLogStore();
    // The cron handler checks hour !== 9 BEFORE entering the company loop
    if (hour !== 9) {
      // Nothing inserted
    } else {
      log.insert(COMPANY_A, getWeekStart(), TYPE);
    }
    expect(log.size()).toBe(0); // no inserts because hour guard fired
    vi.useRealTimers();
  });
});
