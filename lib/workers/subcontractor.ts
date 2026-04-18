export interface EffectiveSubcontractor {
  id: string;
  name: string;
  source: 'direct' | 'inherited';
  managerName?: string;
}

type WorkerRef = {
  subcontractor_id: string | null;
  subcontractor?: { id: string; name: string } | null;
  responsible_manager_id: string | null;
  full_name: string;
};

export function getEffectiveSubcontractor(
  worker: WorkerRef,
  workersById: Map<string, WorkerRef>,
): EffectiveSubcontractor | null {
  // כלל 1: שיוך ישיר — גובר על הכל
  if (worker.subcontractor_id && worker.subcontractor) {
    return { id: worker.subcontractor_id, name: worker.subcontractor.name, source: 'direct' };
  }

  // כלל 2: ירושה ממנהל עבודה
  if (worker.responsible_manager_id) {
    const manager = workersById.get(worker.responsible_manager_id);
    if (manager?.subcontractor_id && manager?.subcontractor) {
      return {
        id: manager.subcontractor_id,
        name: manager.subcontractor.name,
        source: 'inherited',
        managerName: manager.full_name,
      };
    }
  }

  return null;
}
