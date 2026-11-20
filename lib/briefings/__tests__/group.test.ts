/**
 * Group safety briefing (2026-11-20). 55 of 77 active workers had no valid briefing and
 * briefings were done one by one. Same PDF / upload / record code as the single-worker flow.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, format } from 'date-fns';
import type { SafetyBriefing } from '@/types';
import {
  briefingCandidates, briefingStatusOf, languagesInOrder, lastBriefingLanguage, needsBriefing, nextToSign, summarize,
  type BriefingWorker,
} from '@/lib/briefings/group';

const inDays = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');
const briefing = (expires: string, language: SafetyBriefing['language'] = 'hebrew', briefed = inDays(-10)): SafetyBriefing => ({
  id: `b-${expires}`, worker_id: 'w', mode: 'system', language, conducted_by: 'x', signature_url: null,
  file_url: 'briefings/b.pdf', briefed_at: briefed, expires_at: expires, created_at: '',
});
function w(id: string, name: string, over: Partial<BriefingWorker> = {}): BriefingWorker {
  return { id, full_name: name, id_number: `00${id}`, is_active: true, is_foreign_worker: false, photo_url: null, subcontractor_id: null, safety_briefings: [], ...over };
}

describe('who needs a briefing', () => {
  it('missing, expired and expiring within 14 days — not a valid one', () => {
    expect(needsBriefing(w('1', 'א'))).toBe(true);
    expect(needsBriefing(w('2', 'ב', { safety_briefings: [briefing(inDays(-1))] }))).toBe(true);
    expect(needsBriefing(w('3', 'ג', { safety_briefings: [briefing(inDays(5))] }))).toBe(true);
    expect(needsBriefing(w('4', 'ד', { safety_briefings: [briefing(inDays(200))] }))).toBe(false);
  });

  it('uses the latest completed briefing (the shared engine rule)', () => {
    const worker = w('1', 'א', { safety_briefings: [briefing(inDays(-30), 'hebrew', inDays(-400)), briefing(inDays(300), 'russian', inDays(-65))] });
    expect(briefingStatusOf(worker)).toBe('valid');
    expect(lastBriefingLanguage(worker)).toBe('russian');
  });
});

describe('briefingCandidates', () => {
  const list = [
    w('1', 'משה', { subcontractor_id: 's1' }),
    w('2', 'אבי', { safety_briefings: [briefing(inDays(200))] }),
    w('3', 'בני', { is_active: false }),
    w('4', 'גיל', { subcontractor_id: 's2' }),
  ];
  it('active only, by name; "only needing" hides valid ones', () => {
    expect(briefingCandidates(list).map((x) => x.id)).toEqual(['2', '4', '1']);
    expect(briefingCandidates(list, { onlyNeeding: true }).map((x) => x.id)).toEqual(['4', '1']);
  });
  it('filters by subcontractor and by name or ID', () => {
    expect(briefingCandidates(list, { subcontractorId: 's1' }).map((x) => x.id)).toEqual(['1']);
    expect(briefingCandidates(list, { query: 'גי' }).map((x) => x.id)).toEqual(['4']);
    expect(briefingCandidates(list, { query: '002' }).map((x) => x.id)).toEqual(['2']);
  });
});

describe('session progress', () => {
  const order = ['a', 'b', 'c'];
  it('signs in order, skipping who was signed or skipped', () => {
    expect(nextToSign(order, {})).toBe(0);
    expect(nextToSign(order, { a: { kind: 'signed', signature: 'x' }, b: { kind: 'skipped' } })).toBe(2);
    expect(nextToSign(order, { a: { kind: 'signed', signature: 'x' }, b: { kind: 'skipped' }, c: { kind: 'signed', signature: 'y' } })).toBe(-1);
  });

  it('one template presentation per language, in first-appearance order', () => {
    expect(languagesInOrder([
      { workerId: 'a', language: 'thai' }, { workerId: 'b', language: 'hebrew' }, { workerId: 'c', language: 'thai' },
    ])).toEqual(['thai', 'hebrew']);
  });

  it('summary: skipped workers are never saved; unsaved = signed but not yet recorded', () => {
    const s = summarize(order,
      { a: { kind: 'signed', signature: 'x' }, b: { kind: 'skipped' }, c: { kind: 'signed', signature: 'y' } },
      { a: { kind: 'saved', briefingId: '1' }, c: { kind: 'failed', error: 'e' } });
    expect(s).toEqual({ signed: 2, skipped: 1, saved: 1, failed: 1, pending: 0, unsaved: 1 });
  });
});

describe('wiring', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

  it('single and group briefing produce the same document through one shared module', () => {
    const single = read('components/workers/SafetyBriefingCard.tsx');
    const group = read('components/briefings/GroupBriefingFlow.tsx');
    for (const src of [single, group]) {
      expect(src).toContain('saveSystemBriefing(');
      expect(src).toContain('fetchBriefingTemplateUrl(');
      expect(src).not.toMatch(/function (generateBriefingPDF|renderFooterCanvas)/); // no copy of the PDF code
    }
  });

  it('the record is created only through POST /api/safety-briefings with mode "system"', () => {
    const lib = read('lib/briefings/system-briefing.ts');
    expect(lib).toMatch(/fetch\('\/api\/safety-briefings'[\s\S]*mode: 'system'/);
    expect(lib).toContain("fd.append('folder', 'briefings')");
    expect(lib).toMatch(/status === 429[\s\S]*RateLimitedError/); // the group waits and continues
  });

  it('page for company admins only; entry from the workers list; no saving of skipped workers', () => {
    expect(read('app/briefings/group/page.tsx')).toContain('requirePageCompanyAdminRole(');
    expect(read('components/workers/WorkerList.tsx')).toContain('href="/briefings/group"');
    const group = read('components/briefings/GroupBriefingFlow.tsx');
    expect(group).toMatch(/if \(sign\?\.kind !== 'signed'[^)]*\) continue;/);
    expect(group).toContain('beforeunload'); // unsaved signatures are not lost silently
  });
});

describe('briefing footer ID', () => {
  it('prints the ID / passport, or a dash — never "null" (QA PDF 2026-11-20 showed "ID: null")', async () => {
    const { footerIdText } = await import('@/lib/briefings/system-briefing');
    expect(footerIdText({ id: 'w', full_name: 'x', id_number: null })).toBe('—');
    expect(footerIdText({ id: 'w', full_name: 'x', id_number: null, passport_number: 'P123' })).toBe('P123');
    expect(footerIdText({ id: 'w', full_name: 'x', id_number: '012345678', passport_number: 'P1' })).toBe('012345678');
  });
});
