/**
 * The Service Worker must never answer page data from its cache.
 *
 * Next.js fetches a page's server-component payload (RSC) for in-app navigation as
 * GET /workers/<id>?_rsc=<hash>, with header `RSC: 1`. The hash depends only on the
 * router state, so the same navigation always uses the same URL. sw.js v7 cached
 * every such GET cache-first: re-opening a worker card from the list showed the data
 * of its first visit (for example "פג תוקף" and a missing briefing) although the
 * database and the worker list were already up to date.
 *
 * Runs public/sw.js in a sandbox with a fake Cache Storage and network.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ORIGIN = 'https://safedoc.test';
const SW_SOURCE = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');

type Handler = (event: unknown) => void;

function loadServiceWorker(network: (req: Request) => Promise<Response>) {
  const handlers: Record<string, Handler> = {};
  const stores = new Map<string, Map<string, Response>>();
  const networkCalls: string[] = [];

  const cacheFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      async match(req: Request | string) {
        const hit = store.get(typeof req === 'string' ? new URL(req, ORIGIN).href : req.url);
        return hit ? hit.clone() : undefined;
      },
      async put(req: Request, res: Response) { store.set(req.url, res); },
      async add(url: string) { store.set(new URL(url, ORIGIN).href, new Response(`precached ${url}`)); },
    };
  };
  const caches = {
    open: async (name: string) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (req: Request | string) => {
      for (const name of stores.keys()) {
        const hit = await cacheFor(name).match(req);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => { handlers[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  const fetch = (req: Request) => { networkCalls.push(req.url); return network(req); };
  vm.runInNewContext(SW_SOURCE, { self, caches, fetch, URL, Response, Promise, console });

  /** What the page receives: the SW's answer if it intercepts, otherwise the network's. */
  async function browserFetch(path: string, init: RequestInit & { mode?: RequestMode } = {}) {
    const { mode, ...rest } = init;
    const request = new Request(new URL(path, ORIGIN), rest);
    // Request in Node cannot carry mode "navigate"; expose it the way a browser does.
    const req = mode === 'navigate'
      ? { url: request.url, method: 'GET', headers: request.headers, mode: 'navigate' }
      : request;
    let answer: Promise<Response> | undefined;
    handlers.fetch({ request: req, respondWith: (p: Promise<Response>) => { answer = p; } });
    if (answer) return { res: await answer, intercepted: true };
    return { res: await fetch(request), intercepted: false };
  }

  async function lifecycle(type: 'install' | 'activate') {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  return { browserFetch, lifecycle, stores, networkCalls };
}

/** A database whose answer changes: version 1 before the briefing, version 2 after. */
let dbVersion = 1;
const network = async (req: Request) => new Response(`${new URL(req.url).pathname} v${dbVersion}`, { status: 200 });

beforeEach(() => { dbVersion = 1; });

describe('service worker never serves page data from its cache', () => {
  it('re-opening a worker card through an in-app link shows the current data', async () => {
    const sw = loadServiceWorker(network);
    const rscRequest = { headers: { RSC: '1', 'Next-Router-State-Tree': 'workers-list' } };

    const first = await sw.browserFetch('/workers/w1?_rsc=1a2b3', rscRequest);
    expect(await first.res.text()).toBe('/workers/w1 v1');

    dbVersion = 2; // briefing saved in the database

    const again = await sw.browserFetch('/workers/w1?_rsc=1a2b3', rscRequest);
    expect(await again.res.text()).toBe('/workers/w1 v2');
  });

  it('does not intercept or store RSC payloads, page navigations or API responses', async () => {
    const sw = loadServiceWorker(network);
    expect((await sw.browserFetch('/dashboard?_rsc=9f', { headers: { RSC: '1' } })).intercepted).toBe(false);
    expect((await sw.browserFetch('/workers/w1', { headers: { RSC: '1' } })).intercepted).toBe(false);
    expect((await sw.browserFetch('/api/workers')).intercepted).toBe(false);
    await sw.browserFetch('/workers/w1', { mode: 'navigate' });
    const stored = [...sw.stores.values()].flatMap((s) => [...s.keys()]);
    expect(stored.filter((u) => /\/(workers|dashboard|api)\b/.test(u))).toEqual([]);
  });

  it('still serves static files cache-first and the offline page when the network is down', async () => {
    let online = true;
    const sw = loadServiceWorker(async (req) => {
      if (!online) throw new TypeError('offline');
      return network(req);
    });
    await sw.lifecycle('install');
    await sw.browserFetch('/images/hero.png');
    online = false;
    expect((await sw.browserFetch('/images/hero.png')).res.ok).toBe(true);
    expect(await (await sw.browserFetch('/workers', { mode: 'navigate' })).res.text()).toBe('precached /offline.html');
  });

  it('activating the new version deletes the previous cache', async () => {
    const sw = loadServiceWorker(network);
    sw.stores.set('safedoc-v7', new Map([[`${ORIGIN}/workers/w1?_rsc=1a2b3`, new Response('stale')]]));
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    expect([...sw.stores.keys()].filter((k) => k.startsWith('safedoc-'))).toEqual(['safedoc-v8']);
  });
});
