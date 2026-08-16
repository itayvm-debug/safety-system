/**
 * Unit tests — lib/email/weekly-report.ts
 *
 * Covers:
 *  - Subject format for both companies
 *  - HTML contains correct company name for each tenant
 *  - Cross-company branding isolation (Company A not in Company B email)
 *  - All-clear variant carries company name
 *  - Issue-present variant carries company name
 *  - HTML-special-character escaping in company name
 */

import { describe, it, expect } from 'vitest';
import { buildWeeklyReportHtml, buildWeeklyReportSubject } from '../weekly-report';
import type { Issue } from '@/lib/documents/issues';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COMPANY_A = 'נתן ולדמן ובניו בע"מ';       // contains Hebrew + quotes
const COMPANY_B = 'Internal QA & Construction';  // contains & + English

const APP_URL = 'https://app.example.com';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    entityType: 'worker',
    entityId:   'w-1',
    entityName: 'ישראל ישראלי',
    href:       '/workers/w-1',
    problem:    'רישיון פג תוקף',
    status:     'expired',
    isManager:  false,
    subcontractorName: null,
    ...overrides,
  };
}

const ONE_ISSUE = [makeIssue()];
const NO_ISSUES: Issue[] = [];

// ── Subject tests ─────────────────────────────────────────────────────────────

describe('buildWeeklyReportSubject', () => {
  it('W-S1: includes SafeDoc platform brand', () => {
    const subject = buildWeeklyReportSubject(COMPANY_A);
    expect(subject).toContain('SafeDoc');
  });

  it('W-S2: includes company A name', () => {
    const subject = buildWeeklyReportSubject(COMPANY_A);
    expect(subject).toContain(COMPANY_A);
  });

  it('W-S3: includes company B name', () => {
    const subject = buildWeeklyReportSubject(COMPANY_B);
    expect(subject).toContain(COMPANY_B);
  });

  it('W-S4: Company A subject does NOT contain Company B name', () => {
    const subject = buildWeeklyReportSubject(COMPANY_A);
    expect(subject).not.toContain(COMPANY_B);
  });

  it('W-S5: Company B subject does NOT contain Company A name', () => {
    const subject = buildWeeklyReportSubject(COMPANY_B);
    expect(subject).not.toContain(COMPANY_A);
  });

  it('W-S6: subject contains a date string', () => {
    const subject = buildWeeklyReportSubject(COMPANY_A);
    // Date in he-IL locale dd.mm.yyyy format
    expect(subject).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });

  it('W-S7: subject follows exact format prefix', () => {
    const subject = buildWeeklyReportSubject(COMPANY_A);
    expect(subject.startsWith('SafeDoc — דוח סטטוס שבועי —')).toBe(true);
  });
});

// ── HTML — issues-present variant ─────────────────────────────────────────────

describe('buildWeeklyReportHtml — with issues', () => {
  it('W-H1: Company A HTML contains "חברה:" label', () => {
    const html = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, COMPANY_A);
    expect(html).toContain('חברה:');
  });

  it('W-H2: Company A HTML contains Company A name', () => {
    const html = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, COMPANY_A);
    // quotes escaped as &quot; in HTML
    expect(html).toContain('נתן ולדמן ובניו בע&quot;מ');
  });

  it('W-H3: Company B HTML contains Company B name', () => {
    const html = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, COMPANY_B);
    // & escaped as &amp; in HTML
    expect(html).toContain('Internal QA &amp; Construction');
  });

  it('W-H4: Company A HTML does NOT contain Company B plain name', () => {
    const html = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, COMPANY_A);
    expect(html).not.toContain('Internal QA');
  });

  it('W-H5: Company B HTML does NOT contain Company A name fragment', () => {
    const html = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, COMPANY_B);
    expect(html).not.toContain('נתן ולדמן');
  });

  it('W-H6: company name appears in the header (orange banner area)', () => {
    const html = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, COMPANY_A);
    // The header td has background:#ea580c; company name div must follow the header divs
    const headerIdx = html.indexOf('background:#ea580c');
    const companyIdx = html.indexOf('חברה:');
    expect(headerIdx).toBeGreaterThan(-1);
    expect(companyIdx).toBeGreaterThan(headerIdx);
    // company name must appear before the closing </td> of the header cell
    const headerClosingTd = html.indexOf('</td>', headerIdx);
    expect(companyIdx).toBeLessThan(headerClosingTd);
  });

  it('W-H7: HTML is valid UTF-8 structure (has DOCTYPE and direction)', () => {
    const html = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, COMPANY_A);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('dir="rtl"');
  });
});

// ── HTML — all-clear (no issues) variant ──────────────────────────────────────

describe('buildWeeklyReportHtml — all-clear (no issues)', () => {
  it('W-AC1: all-clear HTML contains "חברה:" label', () => {
    const html = buildWeeklyReportHtml(NO_ISSUES, APP_URL, COMPANY_A);
    expect(html).toContain('חברה:');
  });

  it('W-AC2: all-clear Company A HTML contains Company A name', () => {
    const html = buildWeeklyReportHtml(NO_ISSUES, APP_URL, COMPANY_A);
    expect(html).toContain('נתן ולדמן ובניו בע&quot;מ');
  });

  it('W-AC3: all-clear Company B HTML contains Company B name', () => {
    const html = buildWeeklyReportHtml(NO_ISSUES, APP_URL, COMPANY_B);
    expect(html).toContain('Internal QA &amp; Construction');
  });

  it('W-AC4: all-clear Company A HTML does NOT contain Company B name', () => {
    const html = buildWeeklyReportHtml(NO_ISSUES, APP_URL, COMPANY_A);
    expect(html).not.toContain('Internal QA');
  });

  it('W-AC5: all-clear Company B HTML does NOT contain Company A name', () => {
    const html = buildWeeklyReportHtml(NO_ISSUES, APP_URL, COMPANY_B);
    expect(html).not.toContain('נתן ולדמן');
  });

  it('W-AC6: all-clear email still shows הכל תקין! message', () => {
    const html = buildWeeklyReportHtml(NO_ISSUES, APP_URL, COMPANY_A);
    expect(html).toContain('הכל תקין!');
  });
});

// ── HTML — character escaping ─────────────────────────────────────────────────

describe('buildWeeklyReportHtml — HTML escaping', () => {
  it('W-ESC1: < in company name is escaped as &lt;', () => {
    const html = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, 'A<B');
    expect(html).toContain('A&lt;B');
    expect(html).not.toContain('A<B');
  });

  it('W-ESC2: > in company name is escaped as &gt;', () => {
    const html = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, 'C>D');
    expect(html).toContain('C&gt;D');
  });

  it('W-ESC3: & in company name is escaped as &amp;', () => {
    const html = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, 'A & B');
    expect(html).toContain('A &amp; B');
  });

  it('W-ESC4: " in company name is escaped as &quot;', () => {
    const html = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, 'בע"מ');
    expect(html).toContain('בע&quot;מ');
  });
});

// ── Cross-company run simulation ──────────────────────────────────────────────

describe('multi-tenant run isolation', () => {
  it('W-MT1: two companies produce different subjects', () => {
    const subjectA = buildWeeklyReportSubject(COMPANY_A);
    const subjectB = buildWeeklyReportSubject(COMPANY_B);
    expect(subjectA).not.toBe(subjectB);
    expect(subjectA).toContain(COMPANY_A);
    expect(subjectB).toContain(COMPANY_B);
  });

  it('W-MT2: two companies produce different HTML bodies', () => {
    const htmlA = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, COMPANY_A);
    const htmlB = buildWeeklyReportHtml(ONE_ISSUE, APP_URL, COMPANY_B);
    expect(htmlA).not.toBe(htmlB);
  });

  it('W-MT3: Company A HTML and Company B HTML have no cross-contamination', () => {
    const htmlA = buildWeeklyReportHtml(NO_ISSUES, APP_URL, COMPANY_A);
    const htmlB = buildWeeklyReportHtml(ONE_ISSUE,  APP_URL, COMPANY_B);
    // Company A content not in B
    expect(htmlB).not.toContain('נתן ולדמן');
    // Company B content not in A
    expect(htmlA).not.toContain('Internal QA');
  });
});
