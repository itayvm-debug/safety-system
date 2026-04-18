export interface EffectiveSubcontractor {
  id: string;
  name: string;
  source: 'direct' | 'via-manager';
  managerName?: string;
}

type WorkerRef = {
  subcontractor_id: string | null;
  subcontractor?: { id: string; name: string } | null;
  responsible_manager_id: string | null;
  full_name: string;
};

/**
 * כלל עדיפות:
 * 1. מנהל עבודה עם קבלן → הקבלן של המנהל גובר
 * 2. שיוך ישיר לקבלן
 * 3. null
 */
export function getEffectiveSubcontractor(
  worker: WorkerRef,
  workersById: Map<string, WorkerRef>,
): EffectiveSubcontractor | null {
  // כלל 1: מנהל עם קבלן — גובר על שיוך ישיר
  if (worker.responsible_manager_id) {
    const manager = workersById.get(worker.responsible_manager_id);
    if (manager?.subcontractor_id && manager?.subcontractor) {
      return {
        id: manager.subcontractor_id,
        name: manager.subcontractor.name,
        source: 'via-manager',
        managerName: manager.full_name,
      };
    }
  }

  // כלל 2: שיוך ישיר
  if (worker.subcontractor_id && worker.subcontractor) {
    return { id: worker.subcontractor_id, name: worker.subcontractor.name, source: 'direct' };
  }

  return null;
}
