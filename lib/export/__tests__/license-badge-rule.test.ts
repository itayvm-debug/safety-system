/**
 * C-10 — תג הסטטוס בשורת רישיון (ProfessionalLicensesCard / ManagerDocumentsCard)
 * חייב להשתמש באותו כלל כמו המנוע: קובץ חובה; תאריך תוקף חובה רק אם הוזן
 * (requiresExpiry = !!expiry_date).
 *
 * לפני התיקון: הכרטיסים חישבו requiresExpiry=true → רישיון עם קובץ וללא תוקף הוצג "חסר"
 * בזמן שסטטוס העובד (getWorkerStatus) היה "תקין".
 *
 * (הקובץ ממוקם כאן כי תיקיות הבדיקות הקיימות של components אינן נכללות ב-vitest.)
 */
import { describe, it, expect } from 'vitest';
import { addDays, subDays, format } from 'date-fns';
import { getDocumentStatus, getProfessionalLicenseStatus, getWorkerStatus } from '@/lib/documents/status';
import type { ProfessionalLicense, ManagerLicense, WorkerWithDocuments } from '@/types';

const d = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');
const past = (n: number) => format(subDays(new Date(), n), 'yyyy-MM-dd');

function prof(file: string | null, expiry: string | null): ProfessionalLicense {
  return {
    id: 'pl1', worker_id: 'w1', license_type: 'רתך', license_number: null,
    expiry_date: expiry, file_url: file, notes: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
}
function mgr(file: string | null, expiry: string | null): ManagerLicense {
  return {
    id: 'ml1', worker_id: 'w1', license_type: 'רישיון נהיגה', vehicle_number: null,
    file_url: file, expiry_date: expiry,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
}

/** הכלל שבו משתמש ManagerFileRow אחרי התיקון */
function managerRowStatus(l: ManagerLicense, required = true) {
  return getDocumentStatus(l.file_url, l.expiry_date, required, !!l.expiry_date);
}

/** עובד שכל השאר אצלו תקין — כדי שהסטטוס הכולל ישקף רק את הרישיון */
function worker(extra: Partial<WorkerWithDocuments>): WorkerWithDocuments {
  return {
    id: 'w1', full_name: 'עובד', is_foreign_worker: false,
    is_crane_operator: false, is_responsible_site_manager: false, subcontractor_id: null,
    documents: [
      { id: 'd1', doc_type: 'id_document', file_url: 'id.pdf', expiry_date: null, is_required: true },
      { id: 'd2', doc_type: 'height_permit', file_url: 'h.pdf', expiry_date: d(200), is_required: true },
    ],
    safety_briefings: [{ id: 'b1', briefed_at: d(0), expires_at: d(300), created_at: '2026-01-01T00:00:00Z' }],
    height_restrictions: [], lifting_machine_appointments: [],
    professional_licenses: [], manager_licenses: [], vehicles: [],
    ...extra,
  } as unknown as WorkerWithDocuments;
}

describe('תג רישיון מקצועי — getProfessionalLicenseStatus', () => {
  it('קובץ ללא תוקף → תקין (ולא "חסר"), תואם לסטטוס העובד', () => {
    const lic = prof('pl.pdf', null);
    expect(getProfessionalLicenseStatus(lic)).toBe('valid');
    expect(getWorkerStatus(worker({ professional_licenses: [lic] }))).toBe('valid');
    // הכלל הישן בכרטיס (requiresExpiry=true) — משחזר את הפגם
    expect(getDocumentStatus(lic.file_url, lic.expiry_date, true, true)).toBe('missing');
  });

  it('ללא קובץ → חסר', () => {
    expect(getProfessionalLicenseStatus(prof(null, null))).toBe('missing');
    expect(getProfessionalLicenseStatus(prof(null, d(100)))).toBe('missing');
  });

  it('תוקף שהוזן נבדק: פג / עומד לפוג / תקין', () => {
    expect(getProfessionalLicenseStatus(prof('pl.pdf', past(1)))).toBe('expired');
    expect(getProfessionalLicenseStatus(prof('pl.pdf', d(5)))).toBe('expiring_soon');
    expect(getProfessionalLicenseStatus(prof('pl.pdf', d(100)))).toBe('valid');
  });

  it('תג השורה תואם תמיד לתרומת הרישיון לסטטוס העובד', () => {
    for (const lic of [prof('a', null), prof(null, null), prof('a', past(3)), prof('a', d(3)), prof('a', d(90))]) {
      expect(getWorkerStatus(worker({ professional_licenses: [lic] }))).toBe(getProfessionalLicenseStatus(lic));
    }
  });
});

describe('תג רישיון מנהל — getDocumentStatus עם requiresExpiry = !!expiry_date', () => {
  it('קובץ ללא תוקף → תקין, תואם לסטטוס מנהל העבודה', () => {
    const lic = mgr('dl.pdf', null);
    expect(managerRowStatus(lic)).toBe('valid');
    expect(getWorkerStatus(worker({ is_responsible_site_manager: true, manager_licenses: [lic] }))).toBe('valid');
  });

  it('תג השורה תואם תמיד לתרומת הרישיון לסטטוס מנהל העבודה', () => {
    for (const lic of [mgr('a', null), mgr(null, null), mgr('a', past(3)), mgr('a', d(3)), mgr('a', d(90))]) {
      expect(getWorkerStatus(worker({ is_responsible_site_manager: true, manager_licenses: [lic] })))
        .toBe(managerRowStatus(lic));
    }
  });
});
