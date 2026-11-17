/**
 * P0·4 (visa lock in the engine), C-09 (id document rule shared), C-15 (unparseable
 * dates), and the invariant that getWorkerStatus agrees with buildWorkerIssues.
 */
import { describe, it, expect } from 'vitest';
import { addDays, format } from 'date-fns';
import { getWorkerStatus, getDocumentStatus, getBriefingStatus, STATUS_SEVERITY } from '@/lib/documents/status';
import { buildWorkerIssues } from '@/lib/documents/issues';
import type { Document, DocumentStatus, DocumentType, SafetyBriefing, WorkerWithDocuments } from '@/types';

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const inDays = (n: number) => ymd(addDays(new Date(), n));

function doc(doc_type: DocumentType, over: Partial<Document> = {}): Document {
  return {
    id: `d-${doc_type}`, company_id: 'c', worker_id: 'w', doc_type, license_name: null,
    file_url: `documents/${doc_type}.pdf`, expiry_date: inDays(300), is_required: true,
    uploaded_at: '', updated_at: '', ...over,
  };
}

const briefing: SafetyBriefing = {
  id: 'b', worker_id: 'w', mode: 'system', language: 'hebrew', conducted_by: null,
  signature_url: null, file_url: 'briefings/b.pdf', briefed_at: inDays(-10), expires_at: inDays(355), created_at: '',
};

function worker(over: Partial<WorkerWithDocuments> = {}): WorkerWithDocuments {
  return {
    id: 'w', company_id: 'c', full_name: 'עובד', is_foreign_worker: false, national_id: null, passport_number: null,
    id_number: null, phone: null, notes: null, photo_url: null, is_active: true, is_crane_operator: false,
    is_responsible_site_manager: false, responsible_manager_id: null, project_name: null, subcontractor_id: null,
    father_name: null, birth_year: null, profession: null, address: null, is_archived: false, archived_at: null,
    archived_by: null, created_at: '', updated_at: '',
    documents: [doc('id_document', { expiry_date: null }), doc('height_permit')],
    safety_briefings: [briefing], height_restrictions: [], lifting_machine_appointments: [],
    professional_licenses: [], manager_licenses: [], vehicles: [],
    ...over,
  };
}

const visaIssue = (w: WorkerWithDocuments) => buildWorkerIssues(w).find(i => i.id.endsWith('-work_visa'));

describe('P0·4 — work visa of a foreign worker is always required', () => {
  it('a visa saved as "not required" (while the worker was Israeli) counts as missing once the worker is foreign', () => {
    const w = worker({
      is_foreign_worker: true,
      documents: [...worker().documents, doc('work_visa', { is_required: false, file_url: null, expiry_date: null })],
    });
    expect(getWorkerStatus(w)).toBe('missing');
    expect(visaIssue(w)?.status).toBe('missing');
  });

  it('the same "not required" visa does not affect an Israeli worker', () => {
    const w = worker({
      documents: [...worker().documents, doc('work_visa', { is_required: false, file_url: null, expiry_date: null })],
    });
    expect(getWorkerStatus(w)).toBe('valid');
    expect(visaIssue(w)).toBeUndefined();
  });

  it('a foreign worker with a valid visa is valid', () => {
    const w = worker({ is_foreign_worker: true, documents: [...worker().documents, doc('work_visa')] });
    expect(getWorkerStatus(w)).toBe('valid');
    expect(visaIssue(w)).toBeUndefined();
  });

  it('an expired visa is expired even if flagged not required', () => {
    const w = worker({
      is_foreign_worker: true,
      documents: [...worker().documents, doc('work_visa', { is_required: false, expiry_date: inDays(-3) })],
    });
    expect(getWorkerStatus(w)).toBe('expired');
    expect(visaIssue(w)?.status).toBe('expired');
  });
});

describe('C-09 — id document follows one rule in both engines', () => {
  it('an id document with a file is valid in status and produces no issue, whatever its stored date', () => {
    const w = worker({ documents: [doc('id_document', { expiry_date: inDays(-30) }), doc('height_permit')] });
    expect(getWorkerStatus(w)).toBe('valid');
    expect(buildWorkerIssues(w).find(i => i.id.endsWith('-id_document'))).toBeUndefined();
  });

  it('a missing id document is missing in both', () => {
    const w = worker({ documents: [doc('height_permit')] });
    expect(getWorkerStatus(w)).toBe('missing');
    expect(buildWorkerIssues(w).find(i => i.id.endsWith('-id_document'))?.status).toBe('missing');
  });
});

describe('C-15 — an unparseable expiry date is never "valid"', () => {
  it('document', () => {
    expect(getDocumentStatus('documents/x.pdf', 'not-a-date')).toBe('missing');
  });
  it('briefing', () => {
    expect(getBriefingStatus({ ...briefing, expires_at: '2029-02-30x' })).toBe('missing');
  });
});

describe('invariant — worker status equals the worst issue', () => {
  const worst = (w: WorkerWithDocuments): DocumentStatus => {
    const issues = buildWorkerIssues(w);
    if (issues.length === 0) return 'valid';
    return issues.reduce<DocumentStatus>((acc, i) => (STATUS_SEVERITY[i.status] > STATUS_SEVERITY[acc] ? i.status : acc), 'valid');
  };
  const sameSeverity = (a: DocumentStatus, b: DocumentStatus) => STATUS_SEVERITY[a] === STATUS_SEVERITY[b];

  const fixtures: Array<[string, WorkerWithDocuments]> = [
    ['all valid', worker()],
    ['foreign without visa row', worker({ is_foreign_worker: true })],
    ['foreign, visa not required', worker({ is_foreign_worker: true, documents: [...worker().documents, doc('work_visa', { is_required: false })] })],
    ['height permit expiring', worker({ documents: [doc('id_document'), doc('height_permit', { expiry_date: inDays(5) })] })],
    ['no briefing', worker({ safety_briefings: [] })],
    ['crane operator without appointment', worker({ is_crane_operator: true })],
    ['license without expiry', worker({ professional_licenses: [{ id: 'l', worker_id: 'w', license_type: 'חשמלאי', license_number: null, expiry_date: null, file_url: 'documents/l.pdf', notes: null, created_at: '', updated_at: '' }] })],
    ['unparseable permit date', worker({ documents: [doc('id_document'), doc('height_permit', { expiry_date: 'xx' })] })],
  ];

  it.each(fixtures)('%s', (_name, w) => {
    expect(sameSeverity(getWorkerStatus(w), worst(w))).toBe(true);
  });
});
