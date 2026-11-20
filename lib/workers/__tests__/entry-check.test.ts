/**
 * Gate check "who may work today" (/check, 2026-11-20). The verdict must agree with the shared
 * status engine (getWorkerStatus) — the screen has no status rules of its own.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, format } from 'date-fns';
import { getWorkerStatus } from '@/lib/documents/status';
import { checkEntry, matchesWorker, sortForGate } from '@/lib/workers/entry-check';
import type { Document, DocumentType, SafetyBriefing, WorkerWithDocuments } from '@/types';

const inDays = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');

function doc(doc_type: DocumentType, over: Partial<Document> = {}): Document {
  return {
    id: `d-${doc_type}`, company_id: 'c', worker_id: 'w', doc_type, license_name: null,
    file_url: `documents/${doc_type}.pdf`, expiry_date: inDays(300), is_required: true,
    uploaded_at: '', updated_at: '', ...over,
  };
}

const briefing = (expires: string): SafetyBriefing => ({
  id: 'b', worker_id: 'w', mode: 'system', language: 'hebrew', conducted_by: null,
  signature_url: null, file_url: 'briefings/b.pdf', briefed_at: inDays(-10), expires_at: expires, created_at: '',
});

function worker(over: Partial<WorkerWithDocuments> = {}): WorkerWithDocuments {
  return {
    id: 'w', company_id: 'c', full_name: 'משה כהן', is_foreign_worker: false, national_id: '012345678', passport_number: null,
    id_number: null, phone: '050-1234567', notes: null, photo_url: null, is_active: true, is_crane_operator: false,
    is_responsible_site_manager: false, responsible_manager_id: null, project_name: null, subcontractor_id: null,
    father_name: null, birth_year: null, profession: null, address: null, is_archived: false, archived_at: null,
    archived_by: null, created_at: '', updated_at: '',
    documents: [doc('id_document', { expiry_date: null }), doc('height_permit')],
    safety_briefings: [briefing(inDays(355))], height_restrictions: [], lifting_machine_appointments: [],
    professional_licenses: [], manager_licenses: [], vehicles: [],
    ...over,
  };
}

describe('checkEntry', () => {
  it('everything valid → allowed, no reasons', () => {
    expect(checkEntry(worker())).toEqual({ verdict: 'allowed', reasons: [], expiring: [] });
  });

  it('expired briefing → not allowed, with the reason', () => {
    const w = worker({ safety_briefings: [briefing(inDays(-1))] });
    const c = checkEntry(w);
    expect(c.verdict).toBe('not_allowed');
    expect(c.reasons).toEqual(['תדריך בטיחות — פג תוקף']);
  });

  it('foreign worker without a work visa → not allowed ("missing")', () => {
    const c = checkEntry(worker({ is_foreign_worker: true }));
    expect(c.verdict).toBe('not_allowed');
    expect(c.reasons.some((r) => r.endsWith('— חסר'))).toBe(true);
  });

  it('height permit expiring in 5 days → allowed, with a warning', () => {
    const c = checkEntry(worker({ documents: [doc('id_document', { expiry_date: null }), doc('height_permit', { expiry_date: inDays(5) })] }));
    expect(c.verdict).toBe('allowed_expiring');
    expect(c.expiring).toEqual(['אישור עבודה בגובה']);
  });

  it('inactive worker → inactive, whatever the documents', () => {
    expect(checkEntry(worker({ is_active: false })).verdict).toBe('inactive');
  });

  it('always agrees with the shared engine (getWorkerStatus)', () => {
    const cases = [
      worker(),
      worker({ safety_briefings: [] }),
      worker({ is_crane_operator: true }),
      worker({ documents: [doc('id_document', { file_url: null })] }),
      worker({ documents: [doc('id_document', { expiry_date: null }), doc('height_permit', { expiry_date: inDays(3) })] }),
    ];
    for (const w of cases) {
      const s = getWorkerStatus(w);
      const v = checkEntry(w).verdict;
      if (s === 'expired' || s === 'missing') expect(v).toBe('not_allowed');
      else if (s === 'expiring_soon') expect(v).toBe('allowed_expiring');
      else expect(v).toBe('allowed');
    }
  });
});

describe('matchesWorker', () => {
  const w = worker({ passport_number: 'AB 12345' });
  it.each([['משה', true], ['כהן', true], ['0123', true], ['ab123', true], ['1234567', true], ['050', false], ['מ', false], ['דוד', false]])(
    '%s → %s', (q, expected) => expect(matchesWorker(w, q)).toBe(expected),
  );
});

describe('sortForGate', () => {
  it('not allowed first, then expiring, allowed, inactive; by name inside a group', () => {
    const rows = [
      worker({ id: '1', full_name: 'ב', is_active: false }),
      worker({ id: '2', full_name: 'ב' }),
      worker({ id: '3', full_name: 'א' }),
      worker({ id: '4', full_name: 'ג', safety_briefings: [] }),
    ].map((x) => ({ worker: x, check: checkEntry(x) }));
    expect(rows.sort(sortForGate).map((r) => r.worker.id)).toEqual(['4', '3', '2', '1']);
  });
});

describe('wiring', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  it('the screen uses the shared helpers and the batched photo client, and is in the nav', () => {
    const screen = readFileSync(join(ROOT, 'components', 'workers', 'EntryCheckScreen.tsx'), 'utf8');
    expect(screen).toContain('checkEntry(');
    expect(screen).toContain('getPhotoUrl(');
    expect(screen).not.toContain('/api/signed-url');
    expect(screen).not.toMatch(/getWorkerStatus|STATUS_SEVERITY/); // no status logic of its own
    expect(readFileSync(join(ROOT, 'components', 'NavBar.tsx'), 'utf8')).toContain("href: '/check'");
    expect(readFileSync(join(ROOT, 'app', 'check', 'page.tsx'), 'utf8')).toContain('getPageCompanyContext(');
  });
});
