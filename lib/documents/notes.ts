import type { EntityNote, EntityType } from '@/types';
import type { Issue, IssueStatus } from '@/lib/documents/issues';

export interface EntityNameMap {
  name: string;
  href: string;
  isManager?: boolean;
  subcontractorName?: string | null;
}

export function buildNoteIssues(
  notes: EntityNote[],
  entityMap: Map<string, EntityNameMap>
): Issue[] {
  return notes
    .filter((n) => n.status === 'needs_attention')
    .map((n) => {
      const entity = entityMap.get(n.entity_id);
      const shortContent = n.content.length > 60
        ? n.content.slice(0, 60) + '...'
        : n.content;
      return {
        id: `note-${n.id}`,
        entityType: n.entity_type as Issue['entityType'],
        entityId: n.entity_id,
        entityName: entity?.name ?? 'ישות לא ידועה',
        isManager: entity?.isManager ?? false,
        status: 'missing' as IssueStatus,
        problem: `הערה: ${shortContent}`,
        subcontractorId: null,
        subcontractorName: entity?.subcontractorName ?? null,
        managerId: null,
        managerName: null,
        href: entity?.href ?? '/',
      };
    });
}

export function buildEntityMap(
  workers: Array<{ id: string; full_name: string; is_responsible_site_manager?: boolean; subcontractor_id?: string | null; subcontractor?: { name: string } | null }>,
  vehicles: Array<{ id: string; vehicle_type: string; vehicle_number: string }>,
  heavy: Array<{ id: string; description: string }>,
  lifting: Array<{ id: string; description: string }>,
  subcontractors: Array<{ id: string; name: string }> = []
): Map<string, EntityNameMap> {
  const map = new Map<string, EntityNameMap>();

  for (const w of workers) {
    map.set(w.id, {
      name: w.full_name,
      href: `/workers/${w.id}`,
      isManager: w.is_responsible_site_manager && !w.subcontractor_id,
      subcontractorName: w.subcontractor?.name ?? null,
    });
  }
  for (const v of vehicles) {
    map.set(v.id, { name: `${v.vehicle_type} ${v.vehicle_number}`, href: `/vehicles/${v.id}` });
  }
  for (const h of heavy) {
    map.set(h.id, { name: h.description, href: `/heavy-equipment/${h.id}` });
  }
  for (const l of lifting) {
    map.set(l.id, { name: l.description, href: `/lifting-equipment/${l.id}` });
  }
  for (const s of subcontractors) {
    map.set(s.id, { name: s.name, href: `/subcontractors` });
  }

  return map;
}

export type { EntityNote, EntityType };
