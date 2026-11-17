/**
 * C-06 — הערות "דורש טיפול" על ישויות בארכיון / לא פעילות
 *
 * entityMap נבנה (Dashboard, /issues) מישויות פעילות ולא בארכיון בלבד.
 * לפני התיקון: הערה על ישות שאינה במפה הפכה לפריט דחוף בשם "ישות לא ידועה".
 * אחרי: הערה כזו מסוננת; הערה על ישות פעילה נשארת ללא שינוי.
 */
import { describe, it, expect } from 'vitest';
import { buildNoteIssues, buildEntityMap } from '@/lib/documents/notes';
import type { EntityNote, EntityType } from '@/types';

function note(id: string, entityType: EntityType, entityId: string, status: EntityNote['status'] = 'needs_attention'): EntityNote {
  return {
    id,
    company_id: 'c1',
    entity_type: entityType,
    entity_id: entityId,
    content: `הערה ${id}`,
    status,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

// מפה שנבנית כמו ב-Dashboard: רק ישויות פעילות ולא בארכיון
const activeWorker = { id: 'w-active', full_name: 'עובד פעיל', is_responsible_site_manager: false, subcontractor_id: null, subcontractor: null };
const activeVehicle = { id: 'v-active', vehicle_type: 'טנדר', vehicle_number: '12-345-67' };
const activeHeavy = { id: 'h-active', description: 'מחפר' };
const activeLifting = { id: 'l-active', description: 'מנוף' };
const activeSub = { id: 's-active', name: 'קבלן פעיל' };

const entityMap = buildEntityMap([activeWorker], [activeVehicle], [activeHeavy], [activeLifting], [activeSub]);

describe('buildNoteIssues — ישויות בארכיון / לא פעילות', () => {
  it('הערה על עובד בארכיון / לא פעיל (לא במפה) — לא מוצגת', () => {
    const issues = buildNoteIssues([note('n1', 'worker', 'w-archived')], entityMap);
    expect(issues).toHaveLength(0);
  });

  it('אין פריט "ישות לא ידועה" לאף סוג ישות שאינה במפה', () => {
    const issues = buildNoteIssues(
      [
        note('n1', 'worker', 'w-inactive'),
        note('n2', 'vehicle', 'v-archived'),
        note('n3', 'heavy_equipment', 'h-archived'),
        note('n4', 'lifting_equipment', 'l-inactive'),
        note('n5', 'subcontractor', 's-archived'),
      ],
      entityMap
    );
    expect(issues).toHaveLength(0);
    expect(issues.some((i) => i.entityName === 'ישות לא ידועה')).toBe(false);
  });

  it('הערה על ישות פעילה — נשארת, עם שם וקישור נכונים', () => {
    const issues = buildNoteIssues(
      [
        note('n1', 'worker', 'w-active'),
        note('n2', 'worker', 'w-archived'),
        note('n3', 'vehicle', 'v-active'),
        note('n4', 'subcontractor', 's-active'),
      ],
      entityMap
    );
    expect(issues.map((i) => i.id)).toEqual(['note-n1', 'note-n3', 'note-n4']);
    const w = issues[0];
    expect(w.entityName).toBe('עובד פעיל');
    expect(w.href).toBe('/workers/w-active');
    expect(w.status).toBe('missing');
    expect(w.problem).toBe('הערה: הערה n1');
    expect(issues[1].entityName).toBe('טנדר 12-345-67');
    expect(issues[2].href).toBe('/subcontractors');
  });

  it('הערה בסטטוס ok — לא מוצגת גם על ישות פעילה', () => {
    const issues = buildNoteIssues([note('n1', 'worker', 'w-active', 'ok')], entityMap);
    expect(issues).toHaveLength(0);
  });
});
