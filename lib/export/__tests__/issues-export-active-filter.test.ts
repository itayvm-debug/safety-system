/**
 * C-05 — דוח "דורש טיפול" ביצוא חייב לסנן ישויות לא פעילות / בארכיון בכל סוגי הישויות,
 * בדיוק כמו Dashboard ו-/issues (is_active = true AND is_archived = false).
 *
 * לפני התיקון: רק עובדים סוננו (is_active); רכבים, כלי צמ"ה וציוד הרמה לא פעילים
 * או בארכיון יצרו ליקויים בדוח.
 */
import { describe, it, expect } from 'vitest';
import { filterActiveForIssues, isActiveNonArchived } from '@/lib/export/activeEntities';
import { buildAllIssues } from '@/lib/documents/issues';
import type { WorkerWithDocuments, Vehicle, HeavyEquipment, LiftingEquipment } from '@/types';

type Flags = { is_active: boolean; is_archived: boolean };

// ישויות מינימליות ללא מסמכים — כל ישות שתיכלל תייצר ליקויי "חסר"
function worker(id: string, f: Flags): WorkerWithDocuments {
  return {
    id, full_name: id, is_foreign_worker: false, is_crane_operator: false,
    is_responsible_site_manager: false, subcontractor_id: null, subcontractor: null,
    documents: [], safety_briefings: [], height_restrictions: [], lifting_machine_appointments: [],
    ...f,
  } as unknown as WorkerWithDocuments;
}
function vehicle(id: string, f: Flags): Vehicle {
  return {
    id, vehicle_type: 'טנדר', vehicle_number: id, assigned_manager_id: null, assigned_manager: null,
    vehicle_licenses: [], vehicle_insurances: [], ...f,
  } as unknown as Vehicle;
}
function heavy(id: string, f: Flags): HeavyEquipment {
  return {
    id, description: id, license_file_url: null, license_expiry: null,
    subcontractor_id: null, subcontractor: null, heavy_equipment_insurances: [], ...f,
  } as unknown as HeavyEquipment;
}
function lifting(id: string, f: Flags): LiftingEquipment {
  return {
    id, description: id, inspection_file_url: null, inspection_expiry: null,
    subcontractor_id: null, subcontractor: null, ...f,
  } as unknown as LiftingEquipment;
}

const ACTIVE: Flags = { is_active: true, is_archived: false };
const INACTIVE: Flags = { is_active: false, is_archived: false };
const ARCHIVED: Flags = { is_active: true, is_archived: true };

describe('isActiveNonArchived', () => {
  it('פעיל ולא בארכיון → נכלל', () => expect(isActiveNonArchived(ACTIVE)).toBe(true));
  it('לא פעיל → לא נכלל', () => expect(isActiveNonArchived(INACTIVE)).toBe(false));
  it('בארכיון → לא נכלל', () => expect(isActiveNonArchived(ARCHIVED)).toBe(false));
  it('לא פעיל ובארכיון → לא נכלל', () => expect(isActiveNonArchived({ is_active: false, is_archived: true })).toBe(false));
});

describe('filterActiveForIssues — כל סוגי הישויות', () => {
  const data = {
    workers: [worker('w-a', ACTIVE), worker('w-i', INACTIVE), worker('w-x', ARCHIVED)],
    vehicles: [vehicle('v-a', ACTIVE), vehicle('v-i', INACTIVE), vehicle('v-x', ARCHIVED)],
    heavy: [heavy('h-a', ACTIVE), heavy('h-i', INACTIVE), heavy('h-x', ARCHIVED)],
    lifting: [lifting('l-a', ACTIVE), lifting('l-i', INACTIVE), lifting('l-x', ARCHIVED)],
  };

  it('משאיר רק ישויות פעילות שאינן בארכיון', () => {
    const f = filterActiveForIssues(data);
    expect(f.workers.map((e) => e.id)).toEqual(['w-a']);
    expect(f.vehicles.map((e) => e.id)).toEqual(['v-a']);
    expect(f.heavy.map((e) => e.id)).toEqual(['h-a']);
    expect(f.lifting.map((e) => e.id)).toEqual(['l-a']);
  });

  it('ליקויים בדוח נוצרים רק לישויות פעילות', () => {
    const f = filterActiveForIssues(data);
    const issues = buildAllIssues(f.workers, f.vehicles, f.heavy, f.lifting);
    const entityIds = new Set(issues.map((i) => i.entityId));
    expect([...entityIds].sort()).toEqual(['h-a', 'l-a', 'v-a', 'w-a']);
  });

  it('ללא סינון (התנהגות קודמת) — ישויות לא פעילות/בארכיון היו מופיעות', () => {
    const issues = buildAllIssues(
      data.workers.filter((w) => w.is_active), // הסינון הישן: עובדים בלבד
      data.vehicles, data.heavy, data.lifting
    );
    const entityIds = new Set(issues.map((i) => i.entityId));
    expect(entityIds.has('v-i')).toBe(true);
    expect(entityIds.has('h-x')).toBe(true);
    expect(entityIds.has('w-x')).toBe(true); // עובד בארכיון אך is_active=true עבר את הסינון הישן
  });
});
