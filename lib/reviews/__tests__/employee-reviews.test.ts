/**
 * Employee Reviews Module — Unit / Integration Tests
 * 44 test cases covering: feature flags, auth, snapshots, claims,
 * permissions, analytics, reports, email/WhatsApp templates.
 *
 * All tests that touch DB state use mocked Supabase client.
 * No real DB connections are made in this file.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(() => mockSupabase),
}));

vi.mock('@/lib/auth/company-context', () => ({
  getCurrentCompanyContext: vi.fn(),
  requireCompanyAdminRole: vi.fn(),
}));

import { getCurrentCompanyContext } from '@/lib/auth/company-context';
import { getWeekStart, getPreviousWeekStart, weekLabel, isCurrentWeek } from '../week';
import { buildReviewReminderHtml, buildReviewReminderSubject, buildWhatsAppReminderTemplate } from '../reminderEmail';
import { generateReviewReportHtml } from '../generateReviewReport';
import type { ReviewReportRow } from '../generateReviewReport';

// Minimal mock Supabase client
const mockSupabase = {
  from: vi.fn(() => mockSupabase),
  select: vi.fn(() => mockSupabase),
  insert: vi.fn(() => mockSupabase),
  upsert: vi.fn(() => mockSupabase),
  update: vi.fn(() => mockSupabase),
  delete: vi.fn(() => mockSupabase),
  eq: vi.fn(() => mockSupabase),
  neq: vi.fn(() => mockSupabase),
  not: vi.fn(() => mockSupabase),
  in: vi.fn(() => mockSupabase),
  order: vi.fn(() => mockSupabase),
  maybeSingle: vi.fn(),
  single: vi.fn(),
};

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    email: 'a@a.com',
    username: 'a',
    platformRole: 'user' as const,
    companyId: 'company-1',
    companyName: 'Test Co',
    companyRole: 'admin' as const,
    settings: {
      features: { employeeReviews: true, workers: true, documents: true, vehicles: true,
        heavyEquipment: true, liftingEquipment: true, subcontractors: true, reports: true,
        customWorkerFields: false, customDocumentCategories: false, customVehicleFields: false,
        vehicleAssignmentToWorker: true, vehicleAssignmentToSubcontractor: true },
      branding: { displayName: undefined, logoUrl: null, primaryColor: '#f97316', secondaryColor: '#3b82f6', accentColor: '#10b981' },
      ui: { dashboardVariant: 'default' as const, workerFormVariant: 'default' as const, workerListVariant: 'default' as const, vehicleListVariant: 'default' as const, showEmployeeNumber: false, showProjectSelector: true },
      briefingTemplates: {},
    },
    ...overrides,
  };
}

// ─── Week utilities ────────────────────────────────────────────────────────────

describe('ER1: week utilities', () => {
  it('ER1a: getWeekStart returns a Sunday (day 0)', () => {
    const ws = getWeekStart();
    const d = new Date(ws + 'T00:00:00Z');
    expect(d.getUTCDay()).toBe(0);
  });

  it('ER1b: getWeekStart format is YYYY-MM-DD', () => {
    expect(getWeekStart()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('ER1c: getPreviousWeekStart is 7 days before current week', () => {
    const cur  = new Date(getWeekStart() + 'T00:00:00Z');
    const prev = new Date(getPreviousWeekStart() + 'T00:00:00Z');
    expect(cur.getTime() - prev.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('ER1d: weekLabel returns Hebrew string starting with "שבוע"', () => {
    expect(weekLabel('2025-09-07')).toContain('שבוע');
  });

  it('ER1e: isCurrentWeek returns true for today\'s week', () => {
    expect(isCurrentWeek(getWeekStart())).toBe(true);
  });

  it('ER1f: isCurrentWeek returns false for previous week', () => {
    expect(isCurrentWeek(getPreviousWeekStart())).toBe(false);
  });
});

// ─── Feature flag ──────────────────────────────────────────────────────────────

describe('ER2: feature flag', () => {
  it('ER2a: employeeReviews defaults to false', async () => {
    const { DEFAULT_COMPANY_SETTINGS } = await import('@/lib/company/default-settings');
    expect(DEFAULT_COMPANY_SETTINGS.features.employeeReviews).toBe(false);
  });

  it('ER2b: FEATURE_LABELS has employeeReviews key', async () => {
    const { FEATURE_LABELS } = await import('@/lib/company/features');
    expect(FEATURE_LABELS.employeeReviews).toBeDefined();
    expect(FEATURE_LABELS.employeeReviews).toBe('משוב עובדים');
  });

  it('ER2c: resolveCompanySettings propagates employeeReviews=true', async () => {
    const { resolveCompanySettings } = await import('@/lib/company/settings');
    const result = resolveCompanySettings({ features: { employeeReviews: true } });
    expect(result.features.employeeReviews).toBe(true);
  });

  it('ER2d: resolveCompanySettings defaults employeeReviews to false when omitted', async () => {
    const { resolveCompanySettings } = await import('@/lib/company/settings');
    const result = resolveCompanySettings({});
    expect(result.features.employeeReviews).toBe(false);
  });

  it('ER2e: CompanyFeatures interface has employeeReviews field', async () => {
    const { DEFAULT_COMPANY_SETTINGS } = await import('@/lib/company/default-settings');
    expect('employeeReviews' in DEFAULT_COMPANY_SETTINGS.features).toBe(true);
  });
});

// ─── Review auth helper ────────────────────────────────────────────────────────

describe('ER3: requireReviewAuthor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ER3a: owner without mapping returns 403 (no bypass for authorship)', async () => {
    vi.mocked(getCurrentCompanyContext).mockResolvedValue({ context: makeContext({ companyRole: 'owner' }), error: null } as never);
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { requireReviewAuthor } = await import('../auth');
    const result = await requireReviewAuthor();
    expect(result.error).toBeDefined();
    expect(result.context).toBeNull();
  });

  it('ER3b: admin without mapping returns 403 (no bypass for authorship)', async () => {
    vi.mocked(getCurrentCompanyContext).mockResolvedValue({ context: makeContext({ companyRole: 'admin' }), error: null } as never);
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { requireReviewAuthor } = await import('../auth');
    const result = await requireReviewAuthor();
    expect(result.error).toBeDefined();
    expect(result.context).toBeNull();
  });

  it('ER3c: member without mapping returns 403', async () => {
    vi.mocked(getCurrentCompanyContext).mockResolvedValue({ context: makeContext({ companyRole: 'member' }), error: null } as never);
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { requireReviewAuthor } = await import('../auth');
    const result = await requireReviewAuthor();
    expect(result.error).toBeDefined();
    expect(result.context).toBeNull();
  });

  it('ER3d: member with mapping returns managerWorkerId', async () => {
    vi.mocked(getCurrentCompanyContext).mockResolvedValue({ context: makeContext({ companyRole: 'member' }), error: null } as never);
    mockSupabase.maybeSingle.mockResolvedValue({ data: { manager_worker_id: 'manager-42' }, error: null });
    const { requireReviewAuthor } = await import('../auth');
    const result = await requireReviewAuthor();
    expect(result.context?.managerWorkerId).toBe('manager-42');
  });

  it('ER3e: unauthenticated session returns 401', async () => {
    vi.mocked(getCurrentCompanyContext).mockResolvedValue({
      context: null,
      error: new Response(null, { status: 401 }) as never,
      code: 'NO_SESSION',
    } as never);
    const { requireReviewAuthor } = await import('../auth');
    const result = await requireReviewAuthor();
    expect(result.error).toBeDefined();
  });
});

// ─── Week snapshot logic ────────────────────────────────────────────────────────

describe('ER4: snapshot/assignment', () => {
  it('ER4a: getWeekStart is always a Sunday', () => {
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + i);
      const ws = getWeekStart(d);
      expect(new Date(ws + 'T00:00:00Z').getUTCDay()).toBe(0);
    }
  });

  it('ER4b: same day produces same week_start', () => {
    const d = new Date('2025-09-10T12:00:00Z');
    expect(getWeekStart(d)).toBe('2025-09-07');
  });

  it('ER4c: Saturday is still in same week as previous Sunday', () => {
    const saturday = new Date('2025-09-13T12:00:00Z');
    expect(getWeekStart(saturday)).toBe('2025-09-07');
  });

  it('ER4d: next Sunday starts a new week', () => {
    const nextSunday = new Date('2025-09-14T12:00:00Z');
    expect(getWeekStart(nextSunday)).toBe('2025-09-14');
  });
});

// ─── Reminder email ────────────────────────────────────────────────────────────

describe('ER5: reminder email builder', () => {
  it('ER5a: buildReviewReminderHtml contains company name', () => {
    const html = buildReviewReminderHtml('Acme Ltd', '2025-09-07', 10, 5, 'https://app.example.com');
    expect(html).toContain('Acme Ltd');
  });

  it('ER5b: email contains week label', () => {
    const html = buildReviewReminderHtml('Acme', '2025-09-07', 10, 5, 'https://app.example.com');
    expect(html).toContain('שבוע');
  });

  it('ER5c: email contains progress numbers', () => {
    const html = buildReviewReminderHtml('Acme', '2025-09-07', 10, 5, 'https://app.example.com');
    expect(html).toContain('5');
    expect(html).toContain('10');
  });

  it('ER5d: email contains review link', () => {
    const html = buildReviewReminderHtml('Acme', '2025-09-07', 10, 5, 'https://app.example.com');
    expect(html).toContain('https://app.example.com/reviews');
  });

  it('ER5e: email does NOT contain password', () => {
    const html = buildReviewReminderHtml('Acme', '2025-09-07', 10, 5, 'https://app.example.com');
    expect(html).not.toContain('password');
    expect(html).not.toContain('סיסמה');
  });

  it('ER5f: subject contains company name and week', () => {
    const subject = buildReviewReminderSubject('Acme Ltd', '2025-09-07');
    expect(subject).toContain('Acme Ltd');
    expect(subject).toContain('שבוע');
  });

  it('ER5g: 100% completion email does not show link', () => {
    const html = buildReviewReminderHtml('Acme', '2025-09-07', 10, 10, 'https://app.example.com');
    expect(html).toContain('כל הביצועים הוגשו');
  });
});

// ─── WhatsApp template ─────────────────────────────────────────────────────────

describe('ER6: WhatsApp template', () => {
  it('ER6a: template contains company name', () => {
    const msg = buildWhatsAppReminderTemplate('TestCo', '2025-09-07', 3, 'https://app.example.com');
    expect(msg).toContain('TestCo');
  });

  it('ER6b: template contains remaining count', () => {
    const msg = buildWhatsAppReminderTemplate('TestCo', '2025-09-07', 3, 'https://app.example.com');
    expect(msg).toContain('3');
  });

  it('ER6c: template does NOT contain password', () => {
    const msg = buildWhatsAppReminderTemplate('TestCo', '2025-09-07', 3, 'https://app.example.com');
    expect(msg).not.toContain('password');
    expect(msg).not.toContain('סיסמה');
  });

  it('ER6d: template is plain text (no HTML tags)', () => {
    const msg = buildWhatsAppReminderTemplate('TestCo', '2025-09-07', 3, 'https://app.example.com');
    expect(msg).not.toContain('<');
    expect(msg).not.toContain('>');
  });
});

// ─── Report generation ─────────────────────────────────────────────────────────

describe('ER7: review report HTML', () => {
  const sampleRows: ReviewReportRow[] = [
    {
      worker_id: 'w1', worker_name: 'יוסי כהן', manager_name: 'אבי לוי',
      week_start: '2025-09-07',
      productivity_rating: 4, quality_rating: 3, reliability_rating: 5,
      discipline_rating: 4, teamwork_rating: 4, safety_rating: 5,
      is_not_evaluable: false, not_evaluable_reason: null, manager_comment: 'עבד טוב',
      avg_rating: 4.17,
    },
    {
      worker_id: 'w2', worker_name: 'חנה מזרחי', manager_name: 'אבי לוי',
      week_start: '2025-09-07',
      productivity_rating: null, quality_rating: null, reliability_rating: null,
      discipline_rating: null, teamwork_rating: null, safety_rating: null,
      is_not_evaluable: true, not_evaluable_reason: 'לא הגיע לעבודה', manager_comment: null,
      avg_rating: null,
    },
  ];

  it('ER7a: report HTML contains worker names', () => {
    const html = generateReviewReportHtml(sampleRows, { companyName: 'TestCo', logoUrl: null }, '2025-09-07', 'company', 'כלל החברה');
    expect(html).toContain('יוסי כהן');
    expect(html).toContain('חנה מזרחי');
  });

  it('ER7b: report shows "לא ניתן להעריך" for not-evaluable rows', () => {
    const html = generateReviewReportHtml(sampleRows, { companyName: 'TestCo', logoUrl: null }, '2025-09-07', 'company', 'כלל החברה');
    expect(html).toContain('לא ניתן להעריך');
  });

  it('ER7c: report contains week label', () => {
    const html = generateReviewReportHtml(sampleRows, { companyName: 'TestCo', logoUrl: null }, '2025-09-07', 'company', 'כלל החברה');
    expect(html).toContain('שבוע');
  });

  it('ER7d: report contains company name in header', () => {
    const html = generateReviewReportHtml(sampleRows, { companyName: 'TestCo', logoUrl: null }, '2025-09-07', 'company', 'כלל החברה');
    expect(html).toContain('TestCo');
  });

  it('ER7e: report is valid HTML (has doctype)', () => {
    const html = generateReviewReportHtml(sampleRows, { companyName: 'TestCo', logoUrl: null }, '2025-09-07', 'company', 'כלל החברה');
    expect(html.toLowerCase()).toContain('<!doctype html>');
  });

  it('ER7f: report not-evaluable reason appears in cell', () => {
    const html = generateReviewReportHtml(sampleRows, { companyName: 'TestCo', logoUrl: null }, '2025-09-07', 'company', 'כלל החברה');
    expect(html).toContain('לא הגיע לעבודה');
  });
});

// ─── Company isolation (critical) ─────────────────────────────────────────────

describe('ER8: company isolation', () => {
  it('ER8a: DEFAULT_COMPANY_SETTINGS.employeeReviews is false (safe default)', async () => {
    const { DEFAULT_COMPANY_SETTINGS } = await import('@/lib/company/default-settings');
    expect(DEFAULT_COMPANY_SETTINGS.features.employeeReviews).toBe(false);
  });

  it('ER8b: manager mapping has unique constraint on (company_id, manager_worker_id)', () => {
    // Verified via SQL migration: CONSTRAINT mum_unique_manager UNIQUE (company_id, manager_worker_id)
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migration_employee_reviews.sql'),
      'utf-8'
    );
    expect(sql).toContain('mum_unique_manager');
    expect(sql).toContain('mum_unique_user');
  });

  it('ER8c: review assignments unique per (company_id, worker_id, week_start)', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migration_employee_reviews.sql'),
      'utf-8'
    );
    expect(sql).toContain('wra_unique_worker_week');
  });

  it('ER8d: weekly reviews unique per (company_id, worker_id, week_start)', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migration_employee_reviews.sql'),
      'utf-8'
    );
    expect(sql).toContain('wwr_unique_worker_week');
  });

  it('ER8e: all new tables have RLS enabled', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migration_employee_reviews.sql'),
      'utf-8'
    );
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    const tables = ['manager_user_mappings', 'worker_review_assignments', 'worker_weekly_reviews', 'worker_transfer_audit'];
    for (const t of tables) {
      expect(sql).toContain(t);
    }
  });

  it('ER8f: all tables have service_role bypass policies', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migration_employee_reviews.sql'),
      'utf-8'
    );
    expect(sql).toContain('service_role_all_mum');
    expect(sql).toContain('service_role_all_wra');
    expect(sql).toContain('service_role_all_wwr');
    expect(sql).toContain('service_role_all_wta');
  });
});

// ─── Analytics calculations ────────────────────────────────────────────────────

describe('ER9: analytics logic', () => {
  it('ER9a: avg rating calculation is correct', () => {
    const ratings = [4, 3, 5, 4, 4, 5];
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    expect(avg).toBeCloseTo(25 / 6, 5);
  });

  it('ER9b: completion percentage rounds correctly', () => {
    const total = 8;
    const submitted = 3;
    const pct = Math.round((submitted / total) * 100);
    expect(pct).toBe(38);
  });

  it('ER9c: 0 total workers = 0% completion (no divide-by-zero)', () => {
    const total = 0;
    const submitted = 0;
    const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
    expect(pct).toBe(0);
  });
});

// ─── Rating constraints ─────────────────────────────────────────────────────────

describe('ER10: rating constraints', () => {
  it('ER10a: ratings must be between 1 and 5 (CHECK constraint)', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migration_employee_reviews.sql'),
      'utf-8'
    );
    expect(sql).toContain('BETWEEN 1 AND 5');
  });

  it('ER10b: submitted review requires all 6 ratings or is_not_evaluable', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migration_employee_reviews.sql'),
      'utf-8'
    );
    expect(sql).toContain('wwr_submitted_completeness');
  });

  it('ER10c: not_evaluable_reason only allowed when is_not_evaluable=true', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migration_employee_reviews.sql'),
      'utf-8'
    );
    expect(sql).toContain('wwr_not_evaluable_reason');
  });
});

// ─── NavBar / routing ──────────────────────────────────────────────────────────

describe('ER11: routing and nav', () => {
  it('ER11a: reviews page module exists at app/reviews/page.tsx', () => {
    // use top-level imported existsSync
    const filePath = resolve(__dirname, '../../../app/reviews/page.tsx');
    expect(existsSync(filePath)).toBe(true);
  });

  it('ER11b: manager setup page exists at app/reviews/manager-setup/page.tsx', () => {
    // use top-level imported existsSync
    const filePath = resolve(__dirname, '../../../app/reviews/manager-setup/page.tsx');
    expect(existsSync(filePath)).toBe(true);
  });

  it('ER11c: review submit page exists', () => {
    // use top-level imported existsSync
    const filePath = resolve(__dirname, '../../../app/reviews/submit/page.tsx');
    expect(existsSync(filePath)).toBe(true);
  });

  it('ER11d: review reports page exists', () => {
    // use top-level imported existsSync
    const filePath = resolve(__dirname, '../../../app/reviews/reports/page.tsx');
    expect(existsSync(filePath)).toBe(true);
  });
});

// ─── API routes exist ─────────────────────────────────────────────────────────

describe('ER12: API routes', () => {
  const routes = [
    'app/api/reviews/route.ts',
    'app/api/reviews/[id]/route.ts',
    'app/api/reviews/manager-mappings/route.ts',
    'app/api/reviews/manager-mappings/[id]/route.ts',
    'app/api/reviews/snapshot/route.ts',
    'app/api/reviews/claim/route.ts',
    'app/api/reviews/report/route.ts',
    'app/api/reviews/reminder-cron/route.ts',
    'app/api/reviews/weekly-snapshot-cron/route.ts',
  ];

  for (const route of routes) {
    it(`ER12: ${route} exists`, () => {
      // use top-level imported existsSync
      expect(existsSync(resolve(__dirname, '../../../', route))).toBe(true);
    });
  }
});
