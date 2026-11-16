import { describe, it, expect } from 'vitest';
import { addDays, subDays, addYears, format } from 'date-fns';
import {
  getLatestCompletedSafetyBriefing,
  getBriefingStatus,
  getWorkerStatus,
} from '@/lib/documents/status';
import { buildWorkerIssues } from '@/lib/documents/issues';
import type { SafetyBriefing, WorkerWithDocuments } from '@/types';

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const daysAgo = (n: number) => subDays(new Date(), n);

function briefing(id: string, briefedAt: Date, createdAt: string, overrides: Partial<SafetyBriefing> = {}): SafetyBriefing {
  return {
    id, worker_id: 'w1', mode: 'system', language: 'hebrew',
    conducted_by: null, signature_url: null, file_url: `briefings/${id}.pdf`,
    briefed_at: ymd(briefedAt),
    expires_at: ymd(addYears(briefedAt, 1)),
    created_at: createdAt,
    ...overrides,
  };
}

function worker(briefings: SafetyBriefing[]): WorkerWithDocuments {
  return {
    id: 'w1', company_id: '4f3d08b0-6317-40bf-8f69-1702c39f9f05', full_name: 'עובד בדיקה', is_foreign_worker: false,
    national_id: '000000000', passport_number: null, id_number: '000000000',
    phone: null, notes: null, photo_url: null,
    is_active: true, is_crane_operator: false, is_responsible_site_manager: false,
    responsible_manager_id: null, project_name: null,
    subcontractor_id: null, subcontractor: null,
    father_name: null, birth_year: null, profession: null, address: null,
    is_archived: false, archived_at: null, archived_by: null,
    created_at: '', updated_at: '',
    documents: [
      { id: 'd1', company_id: 'c', worker_id: 'w1', doc_type: 'id_document', license_name: null, file_url: 'id.jpg', expiry_date: null, is_required: true, uploaded_at: '', updated_at: '' },
      { id: 'd2', company_id: 'c', worker_id: 'w1', doc_type: 'height_permit', license_name: null, file_url: 'h.pdf', expiry_date: ymd(addDays(new Date(), 300)), is_required: true, uploaded_at: '', updated_at: '' },
    ],
    safety_briefings: briefings,
    height_restrictions: [],
    lifting_machine_appointments: [],
    professional_licenses: [],
    manager_licenses: [],
    vehicles: [],
  };
}

const briefingIssues = (w: WorkerWithDocuments) => buildWorkerIssues(w).filter((i) => i.id.endsWith('-briefing'));

describe('getLatestCompletedSafetyBriefing', () => {
  it('A: old expired + new valid → worker valid, no "דורש טיפול" briefing issue', () => {
    const oldExpired = briefing('old', daysAgo(400), '2025-01-01T08:00:00Z');
    const newValid = briefing('new', daysAgo(1), '2026-11-15T08:00:00Z');
    const w = worker([oldExpired, newValid]);

    expect(getLatestCompletedSafetyBriefing(w.safety_briefings)?.id).toBe('new');
    expect(getWorkerStatus(w)).toBe('valid');
    expect(briefingIssues(w)).toHaveLength(0);
  });

  it('A (backfill): old expired briefing entered AFTER the current one does not override it', () => {
    const current = briefing('current', daysAgo(10), '2026-11-06T08:00:00Z');
    const historicalUploadedLater = briefing('hist', daysAgo(500), '2026-11-16T09:00:00Z', { mode: 'external' });
    const w = worker([current, historicalUploadedLater]);

    expect(getLatestCompletedSafetyBriefing(w.safety_briefings)?.id).toBe('current');
    expect(getWorkerStatus(w)).toBe('valid');
    expect(briefingIssues(w)).toHaveLength(0);
  });

  it('B: old valid + newer valid → newer is used', () => {
    const older = briefing('older', daysAgo(100), '2026-08-08T08:00:00Z');
    const newer = briefing('newer', daysAgo(5), '2026-11-11T08:00:00Z');
    expect(getLatestCompletedSafetyBriefing([older, newer])?.id).toBe('newer');
    expect(getLatestCompletedSafetyBriefing([newer, older])?.id).toBe('newer');
  });

  it('C: several historical briefings → newest completed wins regardless of input order', () => {
    const list = [
      briefing('b2023', daysAgo(1100), '2023-11-01T08:00:00Z'),
      briefing('b2026', daysAgo(30), '2026-10-17T08:00:00Z'),
      briefing('b2024', daysAgo(730), '2024-11-01T08:00:00Z'),
      briefing('b2025', daysAgo(365), '2025-11-01T08:00:00Z'),
    ];
    expect(getLatestCompletedSafetyBriefing(list)?.id).toBe('b2026');
    expect(getLatestCompletedSafetyBriefing([...list].reverse())?.id).toBe('b2026');
  });

  it('D: newest record incomplete (no expires_at) + previous completed valid → previous completed is used', () => {
    const completed = briefing('done', daysAgo(20), '2026-10-27T08:00:00Z');
    const incomplete = briefing('draft', daysAgo(0), '2026-11-16T08:00:00Z', { expires_at: '' });
    const w = worker([completed, incomplete]);

    expect(getLatestCompletedSafetyBriefing(w.safety_briefings)?.id).toBe('done');
    expect(getWorkerStatus(w)).toBe('valid');
  });

  it('D: only incomplete records → treated as missing', () => {
    const incomplete = briefing('draft', daysAgo(0), '2026-11-16T08:00:00Z', { expires_at: '' });
    expect(getLatestCompletedSafetyBriefing([incomplete])).toBeNull();
    expect(getBriefingStatus(getLatestCompletedSafetyBriefing([incomplete]))).toBe('missing');
  });

  it('E: two completed briefings on the same day → later created_at wins, deterministic', () => {
    const day = daysAgo(2);
    const morning = briefing('morning', day, '2026-11-14T06:00:00.000000+00:00');
    const evening = briefing('evening', day, '2026-11-14T15:30:00.123456+00:00');
    expect(getLatestCompletedSafetyBriefing([morning, evening])?.id).toBe('evening');
    expect(getLatestCompletedSafetyBriefing([evening, morning])?.id).toBe('evening');
  });

  it('E: same day and same created_at → id tie-breaker keeps the result stable', () => {
    const day = daysAgo(2);
    const a = briefing('aaa', day, '2026-11-14T06:00:00Z');
    const b = briefing('bbb', day, '2026-11-14T06:00:00Z');
    expect(getLatestCompletedSafetyBriefing([a, b])?.id).toBe('bbb');
    expect(getLatestCompletedSafetyBriefing([b, a])?.id).toBe('bbb');
  });

  it('F: briefing completed today on top of an expired one → immediately valid', () => {
    const expired = briefing('expired', daysAgo(370), '2025-11-11T08:00:00Z');
    const before = worker([expired]);
    expect(getWorkerStatus(before)).toBe('expired');
    expect(briefingIssues(before).map((i) => i.problem)).toEqual(['תדריך בטיחות']);

    const today = briefing('today', new Date(), new Date().toISOString());
    const after = worker([today, ...before.safety_briefings]);
    expect(getLatestCompletedSafetyBriefing(after.safety_briefings)?.id).toBe('today');
    expect(getWorkerStatus(after)).toBe('valid');
    expect(briefingIssues(after)).toHaveLength(0);
  });

  it('does not mutate the input array (history preserved as-is)', () => {
    const list = [briefing('x', daysAgo(400), '2025-01-01T00:00:00Z'), briefing('y', daysAgo(1), '2026-11-15T00:00:00Z')];
    const snapshot = list.map((b) => b.id);
    getLatestCompletedSafetyBriefing(list);
    expect(list.map((b) => b.id)).toEqual(snapshot);
  });

  it('handles null / empty input', () => {
    expect(getLatestCompletedSafetyBriefing(null)).toBeNull();
    expect(getLatestCompletedSafetyBriefing(undefined)).toBeNull();
    expect(getLatestCompletedSafetyBriefing([])).toBeNull();
  });
});
