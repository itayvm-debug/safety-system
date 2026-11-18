/**
 * P1·5 — a site manager's status took only vehicles[0] (no defined order) and counted
 * archived vehicles. Owner decision 2026-11-18: every active, non-archived vehicle counts,
 * worst status wins, in both getWorkerStatus and buildWorkerIssues.
 */
import { describe, it, expect } from 'vitest';
import { addDays, format } from 'date-fns';
import { getWorkerStatus, getActiveManagerVehicles } from '@/lib/documents/status';
import { buildWorkerIssues } from '@/lib/documents/issues';
import type { Document, DocumentType, SafetyBriefing, Vehicle, WorkerWithDocuments } from '@/types';

const inDays = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');

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

function vehicle(id: string, licenseExpiry: string, over: Partial<Vehicle> = {}): Vehicle {
  return {
    id, vehicle_type: 'טנדר', model: null, vehicle_number: `num-${id}`, vehicle_color: null, image_url: null,
    assigned_manager_id: 'w', project_name: null, is_active: true, notes: null, is_archived: false,
    archived_at: null, archived_by: null, created_at: '', updated_at: '',
    vehicle_licenses: [{ id: `l-${id}`, vehicle_id: id, file_url: 'v/l.pdf', expiry_date: licenseExpiry } as never],
    vehicle_insurances: [{ id: `i-${id}`, vehicle_id: id, insurance_type: 'ביטוח חובה', file_url: 'v/i.pdf', expiry_date: inDays(300) } as never],
    ...over,
  };
}

function manager(vehicles: Vehicle[]): WorkerWithDocuments {
  return {
    id: 'w', company_id: 'c', full_name: 'מנהל', is_foreign_worker: false, national_id: null, passport_number: null,
    id_number: null, phone: null, notes: null, photo_url: null, is_active: true, is_crane_operator: false,
    is_responsible_site_manager: true, responsible_manager_id: null, project_name: null, subcontractor_id: null,
    father_name: null, birth_year: null, profession: null, address: null, is_archived: false, archived_at: null,
    archived_by: null, created_at: '', updated_at: '',
    documents: [doc('id_document', { expiry_date: null }), doc('height_permit')],
    safety_briefings: [briefing], height_restrictions: [], lifting_machine_appointments: [],
    professional_licenses: [], manager_licenses: [], vehicles,
  };
}

const vehicleIssues = (w: WorkerWithDocuments) => buildWorkerIssues(w).filter((i) => /-(vehlicense|vehins)-/.test(i.id));

describe('P1·5 — manager status counts every active vehicle', () => {
  it('a second vehicle with an expired license makes the manager expired (old code looked only at the first)', () => {
    const w = manager([vehicle('a', inDays(200)), vehicle('b', inDays(-5))]);
    expect(getWorkerStatus(w)).toBe('expired');
    expect(vehicleIssues(w).map((i) => [i.problem, i.status])).toEqual([['רישיון רכב (num-b)', 'expired']]);
  });

  it('an archived or inactive vehicle no longer affects the manager', () => {
    const w = manager([
      vehicle('old', inDays(-100), { is_archived: true }),
      vehicle('sold', inDays(-50), { is_active: false }),
      vehicle('cur', inDays(200)),
    ]);
    expect(getWorkerStatus(w)).toBe('valid');
    expect(vehicleIssues(w)).toEqual([]);
  });

  it('issues for two problem vehicles get distinct ids', () => {
    const w = manager([vehicle('a', inDays(-1)), vehicle('b', inDays(-2))]);
    const ids = vehicleIssues(w).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['worker-w-vehlicense-a', 'worker-w-vehlicense-b']);
  });

  it('a vehicle row without is_active / is_archived (narrow loader) still counts', () => {
    const v = vehicle('x', inDays(-1));
    delete (v as Partial<Vehicle>).is_active;
    delete (v as Partial<Vehicle>).is_archived;
    expect(getActiveManagerVehicles({ vehicles: [v] })).toHaveLength(1);
  });

  it('a manager without vehicles is unaffected', () => {
    expect(getWorkerStatus(manager([]))).toBe('valid');
  });
});
