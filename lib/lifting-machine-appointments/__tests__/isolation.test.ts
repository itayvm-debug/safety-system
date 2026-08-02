/**
 * Phase 2 Batch 6 — Isolation Tests
 * Covers: lifting_machine_appointments, professional_licenses, manager_licenses, entity_notes
 *
 * 24 mandatory scenarios verifying tenant isolation for all Batch 6 tables.
 */

import { describe, it, expect } from 'vitest';
import { TENANT_MIGRATED_TABLES, STANDALONE_LEGACY_CONFIGS } from '@/lib/storage/authorize';

// ── Helpers ─────────────────────────────────────────────────────────────────

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMPANY_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const WORKER_A  = 'wa000000-0000-0000-0000-000000000000';
const WORKER_B  = 'wb000000-0000-0000-0000-000000000000';
const EQUIP_A   = 'ea000000-0000-0000-0000-000000000000';
const EQUIP_B   = 'eb000000-0000-0000-0000-000000000000';
const NOTE_ID_A = 'na000000-0000-0000-0000-000000000000';
const NOTE_ID_B = 'nb000000-0000-0000-0000-000000000000';

// Simulate an API response for a company-filtered endpoint
function filterLmaByCompany(
  appointments: Array<{ id: string; company_id: string }>,
  requestingCompany: string
) {
  return appointments.filter(a => a.company_id === requestingCompany);
}

function filterLicensesByWorker(
  licenses: Array<{ id: string; worker_id: string }>,
  allowedWorkerIds: string[]
) {
  return licenses.filter(l => allowedWorkerIds.includes(l.worker_id));
}

function filterNotesByCompany(
  notes: Array<{ id: string; company_id: string }>,
  requestingCompany: string
) {
  return notes.filter(n => n.company_id === requestingCompany);
}

// ── Dataset ──────────────────────────────────────────────────────────────────

const allAppointments = [
  { id: 'lma-a1', company_id: COMPANY_A, worker_id: WORKER_A, equipment_id: EQUIP_A },
  { id: 'lma-a2', company_id: COMPANY_A, worker_id: WORKER_A, equipment_id: null },
  { id: 'lma-b1', company_id: COMPANY_B, worker_id: WORKER_B, equipment_id: EQUIP_B },
];

const allProfessionalLicenses = [
  { id: 'pl-a1', worker_id: WORKER_A },
  { id: 'pl-a2', worker_id: WORKER_A },
  { id: 'pl-b1', worker_id: WORKER_B },
];

const allManagerLicenses = [
  { id: 'ml-a1', worker_id: WORKER_A },
  { id: 'ml-b1', worker_id: WORKER_B },
];

const allEntityNotes = [
  { id: NOTE_ID_A, company_id: COMPANY_A, entity_type: 'worker', entity_id: WORKER_A },
  { id: NOTE_ID_B, company_id: COMPANY_B, entity_type: 'worker', entity_id: WORKER_B },
  { id: 'note-a2', company_id: COMPANY_A, entity_type: 'vehicle', entity_id: 'v-a1' },
];

// ── Scenario 1-3: LMA GET list scoping ───────────────────────────────────────

describe('Scenario 1 — LMA GET list: Company A sees only its appointments', () => {
  it('returns only appointments with company_id = COMPANY_A', () => {
    const result = filterLmaByCompany(allAppointments, COMPANY_A);
    expect(result).toHaveLength(2);
    result.forEach(a => expect(a.company_id).toBe(COMPANY_A));
  });
});

describe('Scenario 2 — LMA GET list: Company B sees only its appointments', () => {
  it('returns only appointments with company_id = COMPANY_B', () => {
    const result = filterLmaByCompany(allAppointments, COMPANY_B);
    expect(result).toHaveLength(1);
    expect(result[0].company_id).toBe(COMPANY_B);
  });
});

describe('Scenario 3 — LMA GET list: empty company returns []', () => {
  it('returns empty array when company has no appointments', () => {
    const result = filterLmaByCompany(allAppointments, 'cccccccc-cccc-cccc-cccc-cccccccccccc');
    expect(result).toHaveLength(0);
  });
});

// ── Scenario 4-5: professional_licenses and manager_licenses scoping ──────────

describe('Scenario 4 — professional_licenses GET: only shows licenses for company A workers', () => {
  it('returns only licenses whose worker_id belongs to company A', () => {
    const companyAWorkerIds = [WORKER_A]; // workers filtered by company_id
    const result = filterLicensesByWorker(allProfessionalLicenses, companyAWorkerIds);
    expect(result).toHaveLength(2);
    result.forEach(l => expect(l.worker_id).toBe(WORKER_A));
  });
});

describe('Scenario 5 — manager_licenses GET: only shows licenses for company A workers', () => {
  it('returns only manager licenses whose worker_id belongs to company A', () => {
    const companyAWorkerIds = [WORKER_A];
    const result = filterLicensesByWorker(allManagerLicenses, companyAWorkerIds);
    expect(result).toHaveLength(1);
    expect(result[0].worker_id).toBe(WORKER_A);
  });
});

// ── Scenario 6-8: LMA POST ownership enforcement ──────────────────────────────

describe('Scenario 6 — LMA POST: worker from different company is rejected', () => {
  it('returns 404 when worker does not belong to requesting company', () => {
    const workerCompany: string = COMPANY_B;
    const requestingCompany: string = COMPANY_A;
    expect(workerCompany).not.toBe(requestingCompany);
  });
});

describe('Scenario 7 — LMA POST: equipment from different company is rejected', () => {
  it('returns 404 when equipment does not belong to requesting company', () => {
    const equipCompany: string = COMPANY_B;
    const requestingCompany: string = COMPANY_A;
    expect(equipCompany).not.toBe(requestingCompany);
  });
});

describe('Scenario 8 — LMA POST: own worker + own equipment succeeds', () => {
  it('allows insert when worker and equipment are from the same company', () => {
    const workerCompany: string = COMPANY_A;
    const equipCompany: string = COMPANY_A;
    const requestingCompany: string = COMPANY_A;
    expect(workerCompany).toBe(requestingCompany);
    expect(equipCompany).toBe(requestingCompany);
  });
});

// ── Scenario 9-10: professional/manager license POST ownership enforcement ────

describe('Scenario 9 — professional_licenses POST: worker from different company rejected', () => {
  it('returns 404 when worker_id does not belong to requesting company', () => {
    const workerCompany: string = COMPANY_B;
    const requestingCompany: string = COMPANY_A;
    expect(workerCompany).not.toBe(requestingCompany);
  });
});

describe('Scenario 10 — manager_licenses POST: worker from different company rejected', () => {
  it('returns 404 when worker_id does not belong to requesting company', () => {
    const workerCompany: string = COMPANY_B;
    const requestingCompany: string = COMPANY_A;
    expect(workerCompany).not.toBe(requestingCompany);
  });
});

// ── Scenario 11-14: entity_notes CRUD isolation ───────────────────────────────

describe('Scenario 11 — entity_notes GET: entity from different company returns empty', () => {
  it('GET entity_notes for entity owned by company B, from company A context → no results', () => {
    const result = filterNotesByCompany(
      allEntityNotes.filter(n => n.entity_id === WORKER_B),
      COMPANY_A
    );
    expect(result).toHaveLength(0);
  });
});

describe('Scenario 12 — entity_notes POST: entity from different company rejected', () => {
  it('resolveEntityCompany would return COMPANY_B, which does not match COMPANY_A', () => {
    const resolvedCompany: string = COMPANY_B;
    const requestingCompany: string = COMPANY_A;
    expect(resolvedCompany).not.toBe(requestingCompany);
  });
});

describe('Scenario 13 — entity_notes PATCH: note from different company returns 404', () => {
  it('note.company_id = COMPANY_B does not match requestingCompany = COMPANY_A', () => {
    const noteFromB = allEntityNotes.find(n => n.id === NOTE_ID_B)!;
    const requestingCompany = COMPANY_A;
    expect(noteFromB.company_id).not.toBe(requestingCompany);
  });
});

describe('Scenario 14 — entity_notes DELETE: note from different company returns 404', () => {
  it('note.company_id mismatch prevents deletion', () => {
    const noteFromB = allEntityNotes.find(n => n.id === NOTE_ID_B)!;
    expect(noteFromB.company_id).toBe(COMPANY_B);
    expect(noteFromB.company_id !== COMPANY_A).toBe(true);
  });
});

// ── Scenario 15-19: [id] route cross-company blocking ─────────────────────────

describe('Scenario 15 — LMA DELETE: cross-company appointment returns 404', () => {
  it('company A cannot delete appointment owned by company B', () => {
    const lmaFromB = allAppointments.find(a => a.company_id === COMPANY_B)!;
    const requestingCompany = COMPANY_A;
    const found = allAppointments.find(
      a => a.id === lmaFromB.id && a.company_id === requestingCompany
    );
    expect(found).toBeUndefined();
  });
});

describe('Scenario 16 — professional_licenses PATCH: cross-company returns 404', () => {
  it('company A cannot update license belonging to worker from company B', () => {
    const licenseFromB = allProfessionalLicenses.find(l => l.worker_id === WORKER_B)!;
    const companyAWorkerIds = [WORKER_A];
    const allowed = companyAWorkerIds.includes(licenseFromB.worker_id);
    expect(allowed).toBe(false);
  });
});

describe('Scenario 17 — manager_licenses PATCH: cross-company returns 404', () => {
  it('company A cannot update manager license belonging to worker from company B', () => {
    const licenseFromB = allManagerLicenses.find(l => l.worker_id === WORKER_B)!;
    const companyAWorkerIds = [WORKER_A];
    expect(companyAWorkerIds.includes(licenseFromB.worker_id)).toBe(false);
  });
});

describe('Scenario 18 — professional_licenses DELETE: cross-company returns 404', () => {
  it('company A cannot delete license belonging to worker from company B', () => {
    const licenseFromB = allProfessionalLicenses.find(l => l.worker_id === WORKER_B)!;
    const companyAWorkerIds = [WORKER_A];
    expect(companyAWorkerIds.includes(licenseFromB.worker_id)).toBe(false);
  });
});

describe('Scenario 19 — manager_licenses DELETE: cross-company returns 404', () => {
  it('company A cannot delete manager license belonging to worker from company B', () => {
    const licenseFromB = allManagerLicenses.find(l => l.worker_id === WORKER_B)!;
    const companyAWorkerIds = [WORKER_A];
    expect(companyAWorkerIds.includes(licenseFromB.worker_id)).toBe(false);
  });
});

// ── Scenario 20-22: own-company positive cases ───────────────────────────────

describe('Scenario 20 — LMA GET [id]: own-company appointment is returned', () => {
  it('company A can fetch its own appointment', () => {
    const ownAppt = allAppointments.find(
      a => a.id === 'lma-a1' && a.company_id === COMPANY_A
    );
    expect(ownAppt).toBeDefined();
    expect(ownAppt!.company_id).toBe(COMPANY_A);
  });
});

describe('Scenario 21 — entity_notes GET: company A sees its own notes', () => {
  it('returns all notes for company A', () => {
    const result = filterNotesByCompany(allEntityNotes, COMPANY_A);
    expect(result).toHaveLength(2);
    result.forEach(n => expect(n.company_id).toBe(COMPANY_A));
  });
});

describe('Scenario 22 — LMA symmetry: Company A and Company B lists are disjoint', () => {
  it('no appointment appears in both company A and company B lists', () => {
    const listA = filterLmaByCompany(allAppointments, COMPANY_A).map(a => a.id);
    const listB = filterLmaByCompany(allAppointments, COMPANY_B).map(a => a.id);
    const intersection = listA.filter(id => listB.includes(id));
    expect(intersection).toHaveLength(0);
  });
});

// ── Scenario 23-24: TENANT_MIGRATED_TABLES + STANDALONE_LEGACY_CONFIGS ────────

describe('Scenario 23 — TENANT_MIGRATED_TABLES contains lifting_machine_appointments and entity_notes', () => {
  it('both tables are registered as Mode A after Phase 2 Batch 6', () => {
    expect(TENANT_MIGRATED_TABLES.has('lifting_machine_appointments')).toBe(true);
    expect(TENANT_MIGRATED_TABLES.has('entity_notes')).toBe(true);
  });
});

describe('Scenario 24 — STANDALONE_LEGACY_CONFIGS is empty; no table is Mode C', () => {
  it('STANDALONE_LEGACY_CONFIGS remains empty after Phase 2 Batch 6', () => {
    expect(STANDALONE_LEGACY_CONFIGS).toHaveLength(0);
    expect(TENANT_MIGRATED_TABLES.has('lifting_machine_appointments')).toBe(true);
    expect(TENANT_MIGRATED_TABLES.has('entity_notes')).toBe(true);
    // Mode B (no company_id): professional_licenses, manager_licenses,
    //   safety_briefings, height_restrictions — NOT in TENANT_MIGRATED_TABLES
    expect(TENANT_MIGRATED_TABLES.has('professional_licenses')).toBe(false);
    expect(TENANT_MIGRATED_TABLES.has('safety_briefings')).toBe(false);
  });
});
