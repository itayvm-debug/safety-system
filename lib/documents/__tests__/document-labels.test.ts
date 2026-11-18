/**
 * Found in the live QA round (2026-11-18): a foreign worker's uploaded passport was shown as
 * "תעודת זהות" on the worker card and in the issues list, next to "מספר דרכון".
 */
import { describe, it, expect } from 'vitest';
import { documentTypeLabel } from '@/types';
import { buildWorkerIssues } from '@/lib/documents/issues';
import type { WorkerWithDocuments } from '@/types';

function worker(isForeign: boolean): WorkerWithDocuments {
  return {
    id: 'w', company_id: 'c', full_name: 'עובד', is_foreign_worker: isForeign, national_id: null, passport_number: null,
    id_number: null, phone: null, notes: null, photo_url: null, is_active: true, is_crane_operator: false,
    is_responsible_site_manager: false, responsible_manager_id: null, project_name: null, subcontractor_id: null,
    father_name: null, birth_year: null, profession: null, address: null, is_archived: false, archived_at: null,
    archived_by: null, created_at: '', updated_at: '',
    documents: [], safety_briefings: [], height_restrictions: [], lifting_machine_appointments: [],
    professional_licenses: [], manager_licenses: [], vehicles: [],
  };
}

describe('identity document label', () => {
  it('is "דרכון" for a foreign worker and "תעודת זהות" for an Israeli worker', () => {
    expect(documentTypeLabel('id_document', true)).toBe('דרכון');
    expect(documentTypeLabel('id_document', false)).toBe('תעודת זהות');
    expect(documentTypeLabel('work_visa', true)).toBe('אשרת עבודה');
  });

  it('the issues list (dashboard, /issues, exports) uses the same label', () => {
    const problems = (w: WorkerWithDocuments) => buildWorkerIssues(w).map((i) => i.problem);
    expect(problems(worker(true))).toContain('דרכון');
    expect(problems(worker(true))).not.toContain('תעודת זהות');
    expect(problems(worker(false))).toContain('תעודת זהות');
  });
});
