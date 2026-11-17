/**
 * C-04 — PDF חייב לנבוע מאותו מנוע סטטוס/ליקויים כמו Excel ו-/issues.
 *
 * לפני התיקון:
 *   - כלי צמ"ה: ביטוח נקרא מהעמודות הישנות insurance_file_url / insurance_expiry,
 *     ולכן כלי עם 'ביטוח חובה' תקין ב-heavy_equipment_insurances דווח "חסר ביטוח חובה".
 *   - עובד: פירוט הליקויים השמיט מינוי מפעיל מכונת הרמה, רישיונות מנהל ורכב המנהל.
 */
import { describe, it, expect } from 'vitest';
import { addDays, format } from 'date-fns';
import {
  buildEquipmentHtml,
  buildWorkersHtml,
  getHeavyEquipmentIssueLines,
  getHeavyEquipmentMandatoryInsurance,
  getWorkerIssueLines,
  formatIssueLines,
} from '@/lib/export/generatePdf';
import { buildHeavyEquipmentIssues, buildWorkerIssues } from '@/lib/documents/issues';
import { getHeavyEquipmentStatus } from '@/lib/documents/status';
import type {
  HeavyEquipment,
  HeavyEquipmentInsurance,
  WorkerWithDocuments,
  Document,
  SafetyBriefing,
  ManagerLicense,
  Vehicle,
} from '@/types';

const branding = { companyName: 'חברה', logoUrl: null };

function future(days: number): string {
  return format(addDays(new Date(), days), 'yyyy-MM-dd');
}

function heavy(overrides: Partial<HeavyEquipment> = {}): HeavyEquipment {
  return {
    id: 'h1',
    company_id: 'c1',
    description: 'מחפר JCB',
    license_number: '123',
    image_url: null,
    license_file_url: 'lic.pdf',
    license_expiry: future(200),
    insurance_file_url: null,   // legacy — ריק
    insurance_expiry: null,     // legacy — ריק
    inspection_file_url: null,
    inspection_expiry: null,
    subcontractor_id: null,
    subcontractor: null,
    project_name: null,
    is_active: true,
    is_archived: false,
    archived_at: null,
    archived_by: null,
    manufacturer: null,
    machine_identifier: null,
    safe_working_load: null,
    power_type: null,
    heavy_equipment_insurances: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function heavyIns(type: string, expiry: string | null, file: string | null = 'ins.pdf'): HeavyEquipmentInsurance {
  return {
    id: `ins-${type}`,
    heavy_equipment_id: 'h1',
    company_id: 'c1',
    insurance_type: type,
    file_url: file,
    expiry_date: expiry,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function doc(docType: Document['doc_type'], expiry: string | null): Document {
  return {
    id: `d-${docType}`,
    company_id: 'c1',
    worker_id: 'w1',
    doc_type: docType,
    license_name: null,
    file_url: `${docType}.pdf`,
    expiry_date: expiry,
    is_required: true,
    uploaded_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function briefing(): SafetyBriefing {
  return {
    id: 'b1',
    worker_id: 'w1',
    mode: 'system',
    language: 'hebrew',
    conducted_by: null,
    signature_url: null,
    file_url: null,
    briefed_at: format(new Date(), 'yyyy-MM-dd'),
    expires_at: future(300),
    created_at: '2026-01-01T00:00:00Z',
  };
}

/** עובד שכל מסמכי הבסיס שלו תקינים */
function worker(overrides: Partial<WorkerWithDocuments> = {}): WorkerWithDocuments {
  return {
    id: 'w1',
    company_id: 'c1',
    full_name: 'ישראל ישראלי',
    is_foreign_worker: false,
    national_id: '123456782',
    passport_number: null,
    id_number: null,
    phone: null,
    notes: null,
    photo_url: null,
    is_active: true,
    is_crane_operator: false,
    is_responsible_site_manager: false,
    responsible_manager_id: null,
    project_name: null,
    subcontractor_id: null,
    subcontractor: null,
    father_name: null,
    birth_year: null,
    profession: null,
    address: null,
    is_archived: false,
    archived_at: null,
    archived_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    documents: [doc('id_document', null), doc('height_permit', future(200))],
    safety_briefings: [briefing()],
    height_restrictions: [],
    lifting_machine_appointments: [],
    professional_licenses: [],
    manager_licenses: [],
    vehicles: [],
    ...overrides,
  };
}

describe('PDF — כלי צמ"ה: ביטוח חובה מ-heavy_equipment_insurances', () => {
  const eq = heavy({ heavy_equipment_insurances: [heavyIns('ביטוח חובה', future(120))] });

  it('ביטוח חובה תקין בטבלה + עמודות legacy ריקות → אין ליקוי ביטוח', () => {
    expect(getHeavyEquipmentIssueLines(eq)).toEqual([]);
    expect(getHeavyEquipmentMandatoryInsurance(eq)?.expiry_date).toBe(future(120));
  });

  it('HTML של הדוח לא מציג "חסר" לביטוח ומציג את תוקף הביטוח מהטבלה', () => {
    const html = buildEquipmentHtml([eq], 'כלי צמ"ה', branding).join('');
    expect(html).not.toContain('חסר ביטוח חובה');
    expect(html).not.toContain('חסר: ביטוח חובה');
    expect(html).toContain(future(120));
    expect(html).toContain('✓ תקין');
    // אין אף תא סטטוס "חסר" בשורה
    expect(html).not.toMatch(/font-weight:600">חסר</);
  });

  it('ערכי legacy בלבד (ללא שורה בטבלה) אינם מספיקים — ביטוח חובה חסר, עקבי עם המנוע', () => {
    const legacyOnly = heavy({ insurance_file_url: 'old.pdf', insurance_expiry: future(100), heavy_equipment_insurances: [] });
    expect(getHeavyEquipmentStatus(legacyOnly)).toBe('missing');
    expect(getHeavyEquipmentIssueLines(legacyOnly)).toEqual(['חסר: ביטוח חובה']);
  });

  it('ביטוח מקיף בלבד אינו מחליף ביטוח חובה', () => {
    const compOnly = heavy({ heavy_equipment_insurances: [heavyIns('ביטוח מקיף', future(100))] });
    expect(getHeavyEquipmentIssueLines(compOnly)).toEqual(['חסר: ביטוח חובה']);
  });

  it('פירוט ה-PDF זהה לפלט buildHeavyEquipmentIssues', () => {
    const expiring = heavy({
      license_expiry: future(5),
      heavy_equipment_insurances: [heavyIns('ביטוח חובה', null)],
    });
    expect(getHeavyEquipmentIssueLines(expiring)).toEqual(formatIssueLines(buildHeavyEquipmentIssues(expiring)));
    expect(getHeavyEquipmentIssueLines(expiring)).toEqual(['עומד לפוג: רישיון', 'חסר: ביטוח חובה']);
  });
});

describe('PDF — פירוט ליקויי עובד מ-buildWorkerIssues', () => {
  it('עובד תקין → אין ליקויים', () => {
    expect(getWorkerIssueLines(worker())).toEqual([]);
  });

  it('מפעיל מכונת הרמה ללא מינוי → הליקוי מופיע בנתוני ה-PDF וב-HTML', () => {
    const w = worker({ is_crane_operator: true, lifting_machine_appointments: [] });
    expect(getWorkerIssueLines(w)).toContain('חסר: מינוי מפעיל מכונת הרמה');
    const html = buildWorkersHtml([w], 'עובדים', branding).join('');
    expect(html).toContain('מינוי מפעיל מכונת הרמה');
  });

  it('מנהל עבודה: רישיון מנהל ללא קובץ ורכב ללא מסמכים מופיעים בפירוט', () => {
    const managerLicense: ManagerLicense = {
      id: 'ml1',
      worker_id: 'w1',
      license_type: 'רישיון נהיגה',
      vehicle_number: null,
      file_url: null,
      expiry_date: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const vehicle = {
      id: 'v1',
      vehicle_number: '12-345-67',
      vehicle_licenses: [],
      vehicle_insurances: [],
    } as unknown as Vehicle;
    const w = worker({ is_responsible_site_manager: true, manager_licenses: [managerLicense], vehicles: [vehicle] });
    const lines = getWorkerIssueLines(w);
    expect(lines).toContain('חסר: רישיון נהיגה');
    expect(lines).toContain('חסר: רישיון רכב (12-345-67)');
    expect(lines).toContain('חסר: ביטוח חובה רכב (12-345-67)');
    expect(lines).toEqual(formatIssueLines(buildWorkerIssues(w)));
  });

  it('רישיון מקצועי עם קובץ וללא תוקף — תקין (תוקף נדרש רק אם הוזן)', () => {
    const w = worker({
      professional_licenses: [{
        id: 'pl1', worker_id: 'w1', license_type: 'רתך', license_number: null,
        expiry_date: null, file_url: 'pl.pdf', notes: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      }],
    });
    expect(getWorkerIssueLines(w)).toEqual([]);
  });
});
