import type { WorkerWithDocuments, Vehicle, HeavyEquipment, LiftingEquipment } from '@/types';

/** שדות הפעילות המשותפים לכל הישויות (עובד, רכב, כלי צמ"ה, ציוד הרמה). */
export interface ActivityFlags {
  is_active?: boolean | null;
  is_archived?: boolean | null;
}

/**
 * ישות נכללת בבקרת התקינות השוטפת רק אם היא פעילה ולא בארכיון —
 * אותו כלל כמו ב-Dashboard וב-/issues (is_active = true AND is_archived = false).
 */
export function isActiveNonArchived(entity: ActivityFlags): boolean {
  return entity.is_active === true && !entity.is_archived;
}

export interface IssuesSourceData {
  workers: WorkerWithDocuments[];
  vehicles: Vehicle[];
  heavy: HeavyEquipment[];
  lifting: LiftingEquipment[];
}

/** מסנן את כל סוגי הישויות לדוח "דורש טיפול" לפי isActiveNonArchived. */
export function filterActiveForIssues(data: IssuesSourceData): IssuesSourceData {
  return {
    workers: data.workers.filter(isActiveNonArchived),
    vehicles: data.vehicles.filter(isActiveNonArchived),
    heavy: data.heavy.filter(isActiveNonArchived),
    lifting: data.lifting.filter(isActiveNonArchived),
  };
}
