// In-memory stand-in for Supabase (PostgREST + Storage) used only by the isolated
// browser tests. It never talks to a real project. It implements just what the
// pages under test use: filters eq/neq/is/in/gt/gte/lt/lte, embedded relations,
// single/maybeSingle, count, insert/update/delete with return=representation,
// and Storage upload/sign.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

// parent table -> embedded name -> [cardinality, column]
//   many: child[column] === parent.id     one: child.id === parent[column]
const RELATIONS = {
  workers: {
    documents: ['many', 'worker_id'], safety_briefings: ['many', 'worker_id'],
    height_restrictions: ['many', 'worker_id'], professional_licenses: ['many', 'worker_id'],
    lifting_machine_appointments: ['many', 'worker_id'], manager_licenses: ['many', 'worker_id'],
    vehicles: ['many', 'assigned_manager_id'], subcontractors: ['one', 'subcontractor_id'],
  },
  vehicles: { vehicle_licenses: ['many', 'vehicle_id'], vehicle_insurances: ['many', 'vehicle_id'] },
  heavy_equipment: { heavy_equipment_insurances: ['many', 'heavy_equipment_id'] },
  company_members: { companies: ['one', 'company_id'], profiles: ['one', 'user_id'] },
};

function splitTop(s) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseSelect(select) {
  const embeds = [];
  for (const part of splitTop(select || '*')) {
    const m = /^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/s.exec(part);
    if (m) embeds.push({ alias: m[1] || m[2], table: m[2], inner: m[3] });
  }
  return embeds;
}

function matches(row, key, raw) {
  const v = row[key];
  const [op, ...restParts] = raw.split('.');
  const rest = restParts.join('.');
  const str = (x) => (x === null || x === undefined ? 'null' : String(x));
  switch (op) {
    case 'eq': return str(v) === rest;
    case 'neq': return str(v) !== rest;
    case 'is': return rest === 'null' ? v === null || v === undefined : str(v) === rest;
    case 'in': return rest.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(str(v));
    case 'gt': return str(v) > rest;
    case 'gte': return str(v) >= rest;
    case 'lt': return str(v) < rest;
    case 'lte': return str(v) <= rest;
    case 'not': return !matches(row, key, rest);
    default: return true; // or=, ilike etc.: not used by the pages under test
  }
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

export function createMockSupabase(seed) {
  const db = structuredClone(seed);
  const storage = new Map();
  const log = [];

  const rows = (table) => (db[table] ??= []);

  function embed(table, row, select) {
    const out = { ...row };
    for (const e of parseSelect(select)) {
      const rel = RELATIONS[table]?.[e.table];
      if (!rel) { out[e.alias] = []; continue; }
      const [kind, col] = rel;
      if (kind === 'many') {
        out[e.alias] = rows(e.table).filter((c) => c[col] === row.id).map((c) => embed(e.table, c, e.inner));
      } else {
        const parent = rows(e.table).find((c) => c.id === row[col]);
        out[e.alias] = parent ? embed(e.table, parent, e.inner) : null;
      }
    }
    return out;
  }

  function filterRows(table, params) {
    let list = rows(table);
    for (const [k, v] of params) {
      if (RESERVED.has(k) || k.includes('.')) continue;
      list = list.filter((r) => matches(r, k, v));
    }
    const order = params.get('order');
    if (order) {
      const [col, dir] = order.split(',')[0].split('.');
      list = [...list].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (dir === 'desc' ? -1 : 1));
    }
    const limit = params.get('limit');
    if (limit) list = list.slice(0, Number(limit));
    return list;
  }

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  }

  async function readBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return Buffer.concat(chunks);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mock');
    const body = await readBody(req);
    log.push(`${req.method} ${url.pathname}${url.search}`);

    // ── Storage ──
    const st = /^\/storage\/v1\/object\/(sign\/)?([^/]+)\/(.+)$/.exec(url.pathname);
    if (st) {
      const [, sign, bucket, path] = st;
      const key = `${bucket}/${decodeURIComponent(path)}`;
      if (sign) return send(res, 200, { signedURL: `/object/sign/${key}?token=mock` });
      if (req.method === 'POST' || req.method === 'PUT') {
        storage.set(key, body.length);
        return send(res, 200, { Id: randomUUID(), Key: key });
      }
      if (req.method === 'DELETE') { storage.delete(key); return send(res, 200, {}); }
    }
    if (url.pathname.startsWith('/storage/v1/object') && req.method === 'DELETE') {
      return send(res, 200, []);
    }

    // ── RPC: not provided (the app fails open for rate limiting) ──
    if (url.pathname.startsWith('/rest/v1/rpc/')) return send(res, 404, { message: 'not in mock' });

    const m = /^\/rest\/v1\/(\w+)$/.exec(url.pathname);
    if (!m) return send(res, 404, { message: 'unknown path' });
    const table = m[1];
    const params = url.searchParams;
    const select = params.get('select') ?? '*';
    const single = (req.headers.accept ?? '').includes('vnd.pgrst.object');
    const prefer = req.headers.prefer ?? '';
    const wantRows = prefer.includes('return=representation');

    const reply = (list, status = 200) => {
      const shaped = list.map((r) => embed(table, r, select));
      const headers = { 'Content-Range': `0-${Math.max(shaped.length - 1, 0)}/${shaped.length}` };
      if (single) {
        if (shaped.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, headers);
        return send(res, status, shaped[0], headers);
      }
      return send(res, status, shaped, headers);
    };

    if (req.method === 'GET' || req.method === 'HEAD') {
      const list = filterRows(table, params);
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Range': `0-0/${list.length}` });
        return res.end();
      }
      return reply(list);
    }

    if (req.method === 'POST') {
      const input = JSON.parse(body.toString() || '{}');
      const now = new Date().toISOString();
      const inserted = (Array.isArray(input) ? input : [input]).map((r) => {
        const row = { id: randomUUID(), created_at: now, updated_at: now, ...r };
        rows(table).push(row);
        return row;
      });
      return wantRows ? reply(inserted, 201) : send(res, 201, undefined);
    }

    if (req.method === 'PATCH') {
      const patch = JSON.parse(body.toString() || '{}');
      const list = filterRows(table, params);
      list.forEach((r) => Object.assign(r, patch, { updated_at: new Date().toISOString() }));
      return wantRows ? reply(list) : send(res, 204, undefined);
    }

    if (req.method === 'DELETE') {
      const list = filterRows(table, params);
      db[table] = rows(table).filter((r) => !list.includes(r));
      return wantRows ? reply(list) : send(res, 204, undefined);
    }

    return send(res, 405, { message: 'method' });
  });

  return {
    db, storage, log,
    listen: (port) => new Promise((resolve) => server.listen(port, '127.0.0.1', resolve)),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
