/**
 * Route-test harness: two companies (A, B), a role switch, and a small in-memory
 * Supabase fake that runs the REAL route handlers and the REAL storage helpers
 * (lib/storage/authorize.ts, lib/storage/file-paths.ts) against table rows.
 *
 * Usage in a test file:
 *   vi.mock('@/lib/auth/company-context', async () =>
 *     (await import('@/app/api/__tests__/helpers/route-harness')).companyContextMock());
 *   vi.mock('@/lib/supabase/server', async () =>
 *     (await import('@/app/api/__tests__/helpers/route-harness')).supabaseServerMock());
 *   import { harness, COMPANY_A, COMPANY_B } from '@/app/api/__tests__/helpers/route-harness';
 */
import { NextRequest, NextResponse } from 'next/server';

export const COMPANY_A = 'aaaaaaaa-0000-0000-0000-00000000000a';
export const COMPANY_B = 'bbbbbbbb-0000-0000-0000-00000000000b';
export const TEST_SESSION_SECRET = 'route-harness-session-secret';

type Row = Record<string, unknown>;
type Role = 'owner' | 'admin' | 'member' | 'viewer';
type Op = 'select' | 'insert' | 'upsert' | 'update' | 'delete';

export interface LogEntry {
  op: Op | 'storage.remove';
  table: string;
  payload?: unknown;
  filters?: Array<[string, unknown]>;
}

/** ON DELETE CASCADE relations from supabase/*.sql that the routes rely on. */
const CASCADES: Record<string, Array<{ table: string; fk: string }>> = {
  vehicles: [
    { table: 'vehicle_licenses', fk: 'vehicle_id' },
    { table: 'vehicle_insurances', fk: 'vehicle_id' },
  ],
  heavy_equipment: [{ table: 'heavy_equipment_insurances', fk: 'heavy_equipment_id' }],
  workers: [
    { table: 'documents', fk: 'worker_id' },
    { table: 'safety_briefings', fk: 'worker_id' },
    { table: 'height_restrictions', fk: 'worker_id' },
    { table: 'lifting_machine_appointments', fk: 'worker_id' },
  ],
};

let idCounter = 0;

export const harness = {
  companyId: COMPANY_A,
  role: 'admin' as Role,
  tables: {} as Record<string, Row[]>,
  log: [] as LogEntry[],
  /** every path passed to a successful storage remove() */
  removed: [] as string[],
  removeMode: 'ok' as 'ok' | 'error' | 'throw',
  /** queries on these (table, op) pairs return an error */
  failOn: [] as Array<{ table: string; op: Op }>,
  signedUrlCalls: [] as string[],

  reset(tables: Record<string, Row[]> = {}) {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
    this.companyId = COMPANY_A;
    this.role = 'admin';
    this.tables = {
      companies: [
        { id: COMPANY_A, is_active: true },
        { id: COMPANY_B, is_active: true },
      ],
      ...structuredClone(tables),
    };
    this.log = [];
    this.removed = [];
    this.removeMode = 'ok';
    this.failOn = [];
    this.signedUrlCalls = [];
  },

  as(companyId: string, role: Role = 'admin') {
    this.companyId = companyId;
    this.role = role;
  },

  rows(table: string): Row[] {
    return this.tables[table] ?? [];
  },

  /** index of the first log entry matching op/table, -1 if none */
  indexOf(op: LogEntry['op'], table?: string): number {
    return this.log.findIndex(e => e.op === op && (table === undefined || e.table === table));
  },
};

// ── company-context mock ──────────────────────────────────────────────────────

export function companyContextMock() {
  const context = () => ({
    userId: `user-${harness.companyId.slice(0, 1)}`,
    email: 'user@example.test',
    username: 'user',
    platformRole: 'user' as const,
    companyId: harness.companyId,
    companyName: 'Company',
    companyRole: harness.role,
    settings: {},
  });
  const member = async () => ({ context: context(), error: null });
  const admin = async () =>
    harness.role === 'admin' || harness.role === 'owner'
      ? { context: context(), error: null }
      : {
          context: null,
          error: NextResponse.json({ error: 'פעולה זו מחייבת הרשאת מנהל חברה' }, { status: 403 }),
          code: 'FORBIDDEN_ROLE',
        };
  return {
    getCurrentCompanyContext: member,
    requireCompanyMember: member,
    requireCompanyAdminRole: admin,
  };
}

// ── supabase fake ─────────────────────────────────────────────────────────────

type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

function query(table: string) {
  let op: Op = 'select';
  let payload: Row | Row[] | undefined;
  let onConflict: string[] = [];
  let head = false;
  let limitN: number | undefined;
  const filters: Array<[string, (r: Row) => boolean, unknown]> = [];

  function matched(): Row[] {
    return harness.rows(table).filter(r => filters.every(([, f]) => f(r)));
  }

  function exec(): Result {
    harness.log.push({
      op,
      table,
      payload,
      filters: filters.map(([c, , v]) => [c, v] as [string, unknown]),
    });
    if (harness.failOn.some(f => f.table === table && f.op === op)) {
      return { data: null, error: { message: `${table} ${op} failed` } };
    }
    harness.tables[table] ??= [];
    const all = harness.tables[table];

    switch (op) {
      case 'select': {
        let rows = matched();
        if (limitN !== undefined) rows = rows.slice(0, limitN);
        if (head) return { data: null, error: null, count: rows.length };
        return { data: rows.map(r => ({ ...r })), error: null, count: rows.length };
      }
      case 'insert': {
        const items = (Array.isArray(payload) ? payload : [payload!]).map(p => ({ id: `id-${++idCounter}`, ...p }));
        all.push(...items);
        return { data: items.map(r => ({ ...r })), error: null };
      }
      case 'upsert': {
        const p = payload as Row;
        const hit = all.find(r => onConflict.every(k => r[k] === p[k]));
        const defined = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
        if (hit) {
          Object.assign(hit, defined);
          return { data: [{ ...hit }], error: null };
        }
        const row = { id: `id-${++idCounter}`, ...defined };
        all.push(row);
        return { data: [{ ...row }], error: null };
      }
      case 'update': {
        const rows = matched();
        const defined = Object.fromEntries(Object.entries(payload as Row).filter(([, v]) => v !== undefined));
        rows.forEach(r => Object.assign(r, defined));
        return { data: rows.map(r => ({ ...r })), error: null };
      }
      case 'delete': {
        const rows = matched();
        deleteRows(table, rows);
        return { data: null, error: null };
      }
    }
  }

  const chain = {
    select(_cols?: string, opts?: { head?: boolean; count?: string }) {
      if (opts?.head) head = true;
      return chain;
    },
    insert(p: Row | Row[]) { op = 'insert'; payload = p; return chain; },
    upsert(p: Row, opts?: { onConflict?: string }) {
      op = 'upsert';
      payload = p;
      onConflict = (opts?.onConflict ?? 'id').split(',').map(s => s.trim());
      return chain;
    },
    update(p: Row) { op = 'update'; payload = p; return chain; },
    delete() { op = 'delete'; return chain; },
    eq(c: string, v: unknown) { filters.push([c, r => r[c] === v, v]); return chain; },
    neq(c: string, v: unknown) { filters.push([c, r => r[c] !== v, v]); return chain; },
    in(c: string, vs: unknown[]) { filters.push([c, r => vs.includes(r[c]), vs]); return chain; },
    order() { return chain; },
    limit(n: number) { limitN = n; return chain; },
    maybeSingle(): Promise<Result> {
      const r = exec();
      if (r.error) return Promise.resolve(r);
      const rows = (r.data as Row[] | null) ?? [];
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    single(): Promise<Result> {
      const r = exec();
      if (r.error) return Promise.resolve(r);
      const rows = (r.data as Row[] | null) ?? [];
      if (rows.length !== 1) {
        return Promise.resolve({ data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } });
      }
      return Promise.resolve({ data: rows[0], error: null });
    },
    then<T1 = Result, T2 = never>(
      onFulfilled?: ((v: Result) => T1 | PromiseLike<T1>) | null,
      onRejected?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
    ): Promise<T1 | T2> {
      return Promise.resolve(exec()).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

function deleteRows(table: string, rows: Row[]) {
  if (rows.length === 0) return;
  harness.tables[table] = harness.rows(table).filter(r => !rows.includes(r));
  for (const child of CASCADES[table] ?? []) {
    const ids = rows.map(r => r.id);
    deleteRows(child.table, harness.rows(child.table).filter(r => ids.includes(r[child.fk])));
  }
}

function fakeClient() {
  return {
    from: (table: string) => query(table),
    storage: {
      from: (_bucket: string) => ({
        remove(paths: string[]) {
          harness.log.push({ op: 'storage.remove', table: 'storage', payload: paths });
          if (harness.removeMode === 'throw') return Promise.reject(new Error('storage down'));
          if (harness.removeMode === 'error') return Promise.resolve({ data: null, error: { message: 'storage error' } });
          harness.removed.push(...paths);
          return Promise.resolve({ data: paths.map(name => ({ name })), error: null });
        },
        createSignedUrl(path: string) {
          harness.signedUrlCalls.push(path);
          return Promise.resolve({ data: null, error: { message: 'not in fake' } });
        },
        upload() {
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
  };
}

export function supabaseServerMock() {
  return {
    createServiceClient: () => fakeClient(),
    createClient: async () => fakeClient(),
  };
}

// ── request helpers ───────────────────────────────────────────────────────────

export function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
