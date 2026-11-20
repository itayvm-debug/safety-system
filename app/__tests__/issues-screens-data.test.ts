/**
 * P0·5 — Dashboard and /issues reported "ביטוח חובה חסר" for every active heavy
 * machine because their select omitted heavy_equipment_insurances.
 * P1·7 — a failed query rendered as "הכל תקין".
 * Both screens now use lib/documents/issue-data.ts; these tests drive it and the
 * real /issues page through a fake client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { addDays, format } from 'date-fns';

const inDays = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');
const A = 'aaaaaaaa-0000-0000-0000-000000000001';

let failTable: string | null = null;
let capCount: Record<string, number> = {};
const selects: Record<string, string> = {};

const machine = {
  id: 'he-1', company_id: A, description: 'מחפר', license_file_url: 'heavy-equipment/l.pdf', license_expiry: inDays(200),
  insurance_file_url: null, insurance_expiry: null, subcontractor_id: null, subcontractor: null, is_active: true, is_archived: false,
  heavy_equipment_insurances: [{ id: 'i1', insurance_type: 'ביטוח חובה', file_url: 'heavy-equipment/i.pdf', expiry_date: inDays(200) }],
};

function fakeClient() {
  return {
    from(table: string) {
      const q = {
        select(sel: string) { selects[table] = sel; return q; },
        eq() { return q; },
        then(resolve: (r: unknown) => void) {
          if (table === failTable) return resolve({ data: null, error: { message: 'timeout' }, count: null });
          let data: unknown[] = [];
          if (table === 'heavy_equipment') {
            // honour the select: without the embed the row has no insurances
            data = [selects[table].includes('heavy_equipment_insurances') ? machine : { ...machine, heavy_equipment_insurances: undefined }];
          }
          resolve({ data, error: null, count: capCount[table] ?? data.length });
        },
      };
      return q;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient() }));
vi.mock('@/lib/auth/company-context', () => {
  const ctx = async () => ({
    context: { companyId: A, companyRole: 'admin', platformRole: 'user', userId: 'u', email: 'e', username: 'u', companyName: 'c', settings: {} },
    error: null,
  });
  return { getCurrentCompanyContext: ctx, getPageCompanyContext: ctx };
});
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));
let lastIssues: Array<{ problem: string; entityType: string }> = [];
vi.mock('@/components/issues/IssuesList', () => ({
  default: (p: { issues: Array<{ problem: string; entityType: string }> }) => { lastIssues = p.issues; return null; },
}));

import { loadIssueData } from '@/lib/documents/issue-data';
import IssuesPage from '@/app/issues/page';

beforeEach(() => { failTable = null; capCount = {}; lastIssues = []; });

async function renderIssues() {
  const el = await IssuesPage({ searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(el as never);
}

describe('issue data loader', () => {
  it('selects heavy_equipment_insurances so the mandatory insurance is seen', async () => {
    const d = await loadIssueData(fakeClient() as never, A);
    expect(selects.heavy_equipment).toContain('heavy_equipment_insurances');
    expect(d.heavy[0].heavy_equipment_insurances?.[0].insurance_type).toBe('ביטוח חובה');
    expect(d.failed).toBe(false);
  });

  it('flags a failed query', async () => {
    failTable = 'workers';
    expect((await loadIssueData(fakeClient() as never, A)).failed).toBe(true);
  });

  it('flags a list cut by the row cap', async () => {
    capCount = { heavy_equipment: 1500 };
    expect((await loadIssueData(fakeClient() as never, A)).truncated).toBe(true);
  });
});

describe('/issues page', () => {
  it('does not report missing mandatory insurance for a machine whose insurance is valid', async () => {
    const html = await renderIssues();
    expect(lastIssues.filter(i => i.entityType === 'heavy_equipment')).toEqual([]);
    expect(html).toContain('הכל תקין');
  });

  it('never says "הכל תקין" when a query failed', async () => {
    failTable = 'heavy_equipment';
    const html = await renderIssues();
    expect(html).not.toContain('הכל תקין');
    expect(html).toContain('לא ניתן לטעון את כל נתוני הסטטוס');
  });

  it('warns when the list was truncated', async () => {
    capCount = { workers: 5000 };
    const html = await renderIssues();
    expect(html).not.toContain('הכל תקין');
    expect(html).toContain('הוצגו רק חלק מהרשומות');
  });
});
