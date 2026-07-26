import { describe, it, expect } from 'vitest';
import { addDays, subDays, format } from 'date-fns';
import {
  getDocumentStatus,
  getVehicleStatus,
  getWorkerStatus,
} from '@/lib/documents/status';
import { buildVehicleIssues, buildWorkerIssues } from '@/lib/documents/issues';
import type {
  Vehicle,
  VehicleLicense,
  VehicleInsurance,
  WorkerWithDocuments,
  Document,
  SafetyBriefing,
  HeightRestriction,
} from '@/types';

// ── Date helpers ─────────────────────────────────────────────────────────────

function future(days: number): string {
  return format(addDays(new Date(), days), 'yyyy-MM-dd');
}
function past(days: number): string {
  return format(subDays(new Date(), days), 'yyyy-MM-dd');
}

// ── Minimal fixtures ─────────────────────────────────────────────────────────

function makeLicense(expiryDate: string | null): VehicleLicense {
  return { id: 'lic1', vehicle_id: 'v1', file_url: 'license.pdf', expiry_date: expiryDate, created_at: '', updated_at: '' };
}

function makeInsurance(type: string, fileUrl: string | null, expiryDate: string | null): VehicleInsurance {
  return { id: `ins-${type}`, vehicle_id: 'v1', insurance_type: type, file_url: fileUrl, expiry_date: expiryDate, created_at: '', updated_at: '' };
}

function makeVehicle(licenses: VehicleLicense[], insurances: VehicleInsurance[]): Vehicle {
  return {
    id: 'v1', vehicle_type: 'טנדר', vehicle_number: '123-45-678',
    model: null, vehicle_color: null, image_url: null,
    assigned_manager_id: null, assigned_manager: null,
    project_name: null, is_active: true, notes: null,
    is_archived: false, archived_at: null, archived_by: null,
    vehicle_licenses: licenses,
    vehicle_insurances: insurances,
    created_at: '', updated_at: '',
  };
}

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

function makeWorkerIsraeli(docs: Partial<Document>[] = []): WorkerWithDocuments {
  const base: Document = {
    id: 'doc-id', company_id: TEST_COMPANY_ID, worker_id: 'w1', doc_type: 'id_document',
    license_name: null, file_url: 'id.jpg', expiry_date: null,
    is_required: true, uploaded_at: '', updated_at: '',
  };
  const briefing: SafetyBriefing = {
    id: 'b1', worker_id: 'w1', mode: 'system', language: 'hebrew',
    conducted_by: null, signature_url: null, file_url: null,
    briefed_at: '', expires_at: future(200), created_at: '',
  };
  const restriction: HeightRestriction = {
    id: 'hr1', worker_id: 'w1', language: 'hebrew',
    conducted_by: null, signature_url: null, file_url: null,
    issued_at: '', expires_at: future(200), created_at: '',
  };
  return {
    id: 'w1', company_id: TEST_COMPANY_ID, full_name: 'ישראל ישראלי', is_foreign_worker: false,
    national_id: '000000000', passport_number: null, id_number: '000000000',
    phone: null, notes: null, photo_url: null,
    is_active: true, is_crane_operator: false, is_responsible_site_manager: false,
    responsible_manager_id: null, project_name: null,
    subcontractor_id: null, subcontractor: null,
    father_name: null, birth_year: null, profession: null, address: null,
    is_archived: false, archived_at: null, archived_by: null,
    created_at: '', updated_at: '',
    documents: [base, ...docs as Document[]],
    safety_briefings: [briefing],
    height_restrictions: [restriction],
    lifting_machine_appointments: [],
    professional_licenses: [],
    manager_licenses: [],
    vehicles: [],
  };
}

// ════════════════════════════════════════════════════════════════════════════
// getDocumentStatus — core invariant: not_required supersedes all
// ════════════════════════════════════════════════════════════════════════════

describe('getDocumentStatus — not_required supersedes file and date', () => {
  it('no file, no date, not required → not_required', () => {
    expect(getDocumentStatus(null, null, false)).toBe('not_required');
  });
  it('file present, no date, not required → not_required', () => {
    expect(getDocumentStatus('file.pdf', null, false)).toBe('not_required');
  });
  it('file present, expired date, not required → not_required', () => {
    expect(getDocumentStatus('file.pdf', past(100), false)).toBe('not_required');
  });
  it('file present, future date, not required → not_required', () => {
    expect(getDocumentStatus('file.pdf', future(200), false)).toBe('not_required');
  });
  it('required, no file → missing', () => {
    expect(getDocumentStatus(null, null, true)).toBe('missing');
  });
  it('required, file, expired date → expired', () => {
    expect(getDocumentStatus('file.pdf', past(10), true)).toBe('expired');
  });
  it('required, file, date in 14-day window → expiring_soon', () => {
    expect(getDocumentStatus('file.pdf', future(7), true)).toBe('expiring_soon');
  });
  it('required, file, date beyond 14 days → valid', () => {
    expect(getDocumentStatus('file.pdf', future(30), true)).toBe('valid');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Vehicle A: כל המסמכים תקינים, ביטוח מקיף = לא נדרש → overall valid
// ════════════════════════════════════════════════════════════════════════════

describe('Vehicle A — all valid, comprehensive not required', () => {
  const vehicle = makeVehicle(
    [makeLicense(future(200))],
    [
      makeInsurance('ביטוח חובה', 'mandatory.pdf', future(200)),
      makeInsurance('ביטוח מקיף', null, null),
    ]
  );

  it('getVehicleStatus → valid', () => {
    expect(getVehicleStatus(vehicle)).toBe('valid');
  });
  it('buildVehicleIssues → no issues', () => {
    expect(buildVehicleIssues(vehicle)).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Vehicle B: רישיון עומד לפוג, ביטוח מקיף עם תאריך ישן שפג → expiring_soon
// ════════════════════════════════════════════════════════════════════════════

describe('Vehicle B — license expiring, comprehensive has stale expired data', () => {
  const vehicle = makeVehicle(
    [makeLicense(future(10))],
    [
      makeInsurance('ביטוח חובה', 'mandatory.pdf', future(200)),
      makeInsurance('ביטוח מקיף', 'old_comp.pdf', past(100)),
    ]
  );

  it('getVehicleStatus → expiring_soon (NOT expired)', () => {
    expect(getVehicleStatus(vehicle)).toBe('expiring_soon');
  });
  it('buildVehicleIssues → only one issue (license), NOT comprehensive', () => {
    const issues = buildVehicleIssues(vehicle);
    expect(issues).toHaveLength(1);
    expect(issues[0].problem).toBe('רישיון רכב');
    expect(issues[0].status).toBe('expiring_soon');
  });
  it('buildVehicleIssues → no issue for ביטוח מקיף', () => {
    const issues = buildVehicleIssues(vehicle);
    expect(issues.some((i) => i.problem === 'ביטוח מקיף')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Vehicle C: ביטוח חובה חסר → overall missing
// ════════════════════════════════════════════════════════════════════════════

describe('Vehicle C — mandatory insurance missing', () => {
  const vehicle = makeVehicle([makeLicense(future(200))], []);

  it('getVehicleStatus → missing', () => {
    expect(getVehicleStatus(vehicle)).toBe('missing');
  });
  it('buildVehicleIssues → issue for ביטוח חובה', () => {
    const issues = buildVehicleIssues(vehicle);
    expect(issues.some((i) => i.problem === 'ביטוח חובה')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Worker A: עובד ישראלי, work_visa is_required=false + תאריך פג → overall valid
// ════════════════════════════════════════════════════════════════════════════

describe('Worker A — Israeli, work_visa not_required with stale expired data', () => {
  const staleVisa: Partial<Document> = {
    id: 'doc-visa', company_id: TEST_COMPANY_ID, worker_id: 'w1', doc_type: 'work_visa',
    license_name: null, file_url: 'old_visa.jpg', expiry_date: past(500),
    is_required: false, uploaded_at: '', updated_at: '',
  };
  const worker = makeWorkerIsraeli([staleVisa]);

  it('getDocumentStatus for stale visa with is_required=false → not_required', () => {
    expect(getDocumentStatus('old_visa.jpg', past(500), false, true)).toBe('not_required');
  });
  it('getWorkerStatus → valid (stale not-required doc does not affect overall)', () => {
    expect(getWorkerStatus(worker)).toBe('valid');
  });
  it('buildWorkerIssues → no issue for work_visa', () => {
    const issues = buildWorkerIssues(worker);
    expect(issues.some((i) => i.problem?.includes('אשרת עבודה'))).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Worker B: עובד זר, work_visa חסר → overall missing
// ════════════════════════════════════════════════════════════════════════════

describe('Worker B — foreign worker, work_visa required but missing', () => {
  const worker: WorkerWithDocuments = {
    ...makeWorkerIsraeli(),
    is_foreign_worker: true,
    documents: [
      {
        id: 'doc-id', company_id: TEST_COMPANY_ID, worker_id: 'w1', doc_type: 'id_document',
        license_name: null, file_url: 'id.jpg', expiry_date: null,
        is_required: true, uploaded_at: '', updated_at: '',
      },
      {
        id: 'doc-visa', company_id: TEST_COMPANY_ID, worker_id: 'w1', doc_type: 'work_visa',
        license_name: null, file_url: null, expiry_date: null,
        is_required: true, uploaded_at: '', updated_at: '',
      },
    ],
  };

  it('getWorkerStatus → missing (work_visa required, no file)', () => {
    expect(getWorkerStatus(worker)).toBe('missing');
  });
  it('buildWorkerIssues → issue for work_visa', () => {
    const issues = buildWorkerIssues(worker);
    expect(issues.some((i) => i.problem === 'אשרת עבודה')).toBe(true);
  });
});
