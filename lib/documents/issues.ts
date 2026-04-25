import {
  WorkerWithDocuments,
  Vehicle,
  HeavyEquipment,
  LiftingEquipment,
  DocumentType,
  Document,
  REQUIRED_DOCUMENT_TYPES_FOR_FOREIGN,
  REQUIRED_DOCUMENT_TYPES_FOR_ISRAELI,
} from '@/types';
import {
  getDocumentStatus,
  getBriefingStatus,
  getHeightCombinedStatus,
  STATUS_SEVERITY,
} from '@/lib/documents/status';

export type IssueStatus = 'expired' | 'expiring_soon' | 'missing';

export interface Issue {
  id: string;
  entityType: 'worker' | 'vehicle' | 'heavy_equipment' | 'lifting_equipment';
  entityId: string;
  entityName: string;
  isManager: boolean;
  status: IssueStatus;
  problem: string;
  subcontractorId?: string | null;
  subcontractorName?: string | null;
  managerId?: string | null;
  managerName?: string | null;
  href: string;
}

function toIssue(status: string): IssueStatus | null {
  if (status === 'expired' || status === 'expiring_soon' || status === 'missing') return status as IssueStatus;
  return null;
}

export function buildWorkerIssues(worker: WorkerWithDocuments): Issue[] {
  const issues: Issue[] = [];
  const base = {
    entityType: 'worker' as const,
    entityId: worker.id,
    entityName: worker.full_name,
    // מנהל עבודה פנימי בלבד — לא עובד של קבלן משנה שסומן בטעות
    isManager: worker.is_responsible_site_manager && !worker.subcontractor_id,
    subcontractorId: worker.subcontractor_id,
    subcontractorName: worker.subcontractor?.name ?? null,
    managerId: null as string | null,
    managerName: null as string | null,
    href: `/workers/${worker.id}`,
  };

  const requiredTypes = worker.is_foreign_worker
    ? REQUIRED_DOCUMENT_TYPES_FOR_FOREIGN
    : REQUIRED_DOCUMENT_TYPES_FOR_ISRAELI;

  const docMap = new Map<DocumentType, Document>(
    worker.documents
      .filter((d) => d.doc_type !== 'optional_license')
      .map((d) => [d.doc_type as DocumentType, d])
  );

  const DOC_LABELS: Partial<Record<DocumentType, string>> = {
    id_document: 'תעודת זהות',
    work_visa: 'אשרת עבודה',
  };

  for (const docType of requiredTypes) {
    if (docType === 'height_permit') continue;
    const doc = docMap.get(docType);
    const requiresExpiry = docType !== 'id_document';
    // Respect is_required=false so non-required docs without files don't show as missing
    const isRequired = docType === 'id_document' ? true : (doc ? doc.is_required !== false : true);
    const s = toIssue(getDocumentStatus(doc?.file_url ?? null, doc?.expiry_date ?? null, isRequired, requiresExpiry));
    if (s) issues.push({ ...base, id: `worker-${worker.id}-${docType}`, status: s, problem: DOC_LABELS[docType] ?? docType });
  }

  // אישור עבודה בגובה — משתמש בפונקציה המשותפת מ-status.ts (אותה לוגיקה כמו getWorkerStatus)
  const heightPermitDoc = docMap.get('height_permit');
  const hs = toIssue(getHeightCombinedStatus(heightPermitDoc, worker.height_restrictions ?? []));
  if (hs) issues.push({ ...base, id: `worker-${worker.id}-height`, status: hs, problem: 'אישור עבודה בגובה' });

  // תדריך בטיחות
  const latestBriefing = (worker.safety_briefings ?? [])
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
  const bs = toIssue(getBriefingStatus(latestBriefing));
  if (bs) issues.push({ ...base, id: `worker-${worker.id}-briefing`, status: bs, problem: 'תדריך בטיחות' });

  // מינוי מפעיל מכונת הרמה
  if (worker.is_crane_operator && (worker.lifting_machine_appointments ?? []).length === 0) {
    issues.push({ ...base, id: `worker-${worker.id}-crane`, status: 'missing', problem: 'מינוי מפעיל מכונת הרמה' });
  }

  // רישיונות מקצועיים
  for (const lic of worker.professional_licenses ?? []) {
    const ls = toIssue(getDocumentStatus(lic.file_url, lic.expiry_date, true, !!lic.expiry_date));
    if (ls) issues.push({ ...base, id: `worker-${worker.id}-proflicense-${lic.id}`, status: ls, problem: `רישיון מקצועי: ${lic.license_type}` });
  }

  // מנהל עבודה: רישיונות ורכב (כולל קבלני משנה — הבדיקה היא על is_responsible_site_manager)
  if (worker.is_responsible_site_manager) {
    for (const lic of worker.manager_licenses ?? []) {
      const ls = toIssue(getDocumentStatus(lic.file_url, lic.expiry_date, true, !!lic.expiry_date));
      if (ls) issues.push({ ...base, id: `worker-${worker.id}-manlicense-${lic.id}`, status: ls, problem: lic.license_type });
    }
    const linkedVehicle = (worker.vehicles ?? [])[0] ?? null;
    if (linkedVehicle) {
      const vLic = (linkedVehicle.vehicle_licenses ?? [])[0] ?? null;
      const vls = toIssue(getDocumentStatus(vLic?.file_url ?? null, vLic?.expiry_date ?? null, true, true));
      if (vls) issues.push({ ...base, id: `worker-${worker.id}-vehlicense`, status: vls, problem: `רישיון רכב (${linkedVehicle.vehicle_number})` });

      const mIns = (linkedVehicle.vehicle_insurances ?? []).find((i) => i.insurance_type === 'ביטוח חובה');
      const ins = toIssue(getDocumentStatus(mIns?.file_url ?? null, mIns?.expiry_date ?? null, true, true));
      if (ins) issues.push({ ...base, id: `worker-${worker.id}-vehins`, status: ins, problem: `ביטוח חובה רכב (${linkedVehicle.vehicle_number})` });
    }
  }

  return issues;
}

export function buildVehicleIssues(vehicle: Vehicle): Issue[] {
  const issues: Issue[] = [];
  const base = {
    entityType: 'vehicle' as const,
    entityId: vehicle.id,
    entityName: `${vehicle.vehicle_type} ${vehicle.vehicle_number}`,
    isManager: false,
    managerId: vehicle.assigned_manager_id,
    managerName: vehicle.assigned_manager?.full_name ?? null,
    // subcontractorId/Name מועשר בbuildAllIssues דרך המנהל
    subcontractorId: null as string | null,
    subcontractorName: null as string | null,
    href: `/vehicles/${vehicle.id}`,
  };

  const lic = (vehicle.vehicle_licenses ?? [])[0] ?? null;
  const ls = toIssue(getDocumentStatus(lic?.file_url ?? null, lic?.expiry_date ?? null, true, true));
  if (ls) issues.push({ ...base, id: `vehicle-${vehicle.id}-license`, status: ls, problem: 'רישיון רכב' });

  const mIns = (vehicle.vehicle_insurances ?? []).find((i) => i.insurance_type === 'ביטוח חובה');
  const ins = toIssue(getDocumentStatus(mIns?.file_url ?? null, mIns?.expiry_date ?? null, true, true));
  if (ins) issues.push({ ...base, id: `vehicle-${vehicle.id}-ins`, status: ins, problem: 'ביטוח חובה' });

  for (const optI of (vehicle.vehicle_insurances ?? []).filter((i) => i.insurance_type !== 'ביטוח חובה' && (i.file_url || i.expiry_date))) {
    const os = toIssue(getDocumentStatus(optI.file_url, optI.expiry_date, false, true));
    if (os) issues.push({ ...base, id: `vehicle-${vehicle.id}-ins-${optI.id}`, status: os, problem: optI.insurance_type });
  }

  return issues;
}

export function buildHeavyEquipmentIssues(eq: HeavyEquipment): Issue[] {
  const issues: Issue[] = [];
  const base = {
    entityType: 'heavy_equipment' as const,
    entityId: eq.id,
    entityName: eq.description,
    isManager: false,
    subcontractorId: eq.subcontractor_id,
    subcontractorName: eq.subcontractor?.name ?? null,
    href: `/heavy-equipment/${eq.id}`,
  };

  const ls = toIssue(getDocumentStatus(eq.license_file_url, eq.license_expiry, true, true));
  if (ls) issues.push({ ...base, id: `heavy-${eq.id}-license`, status: ls, problem: 'רישיון' });

  const ins = toIssue(getDocumentStatus(eq.insurance_file_url, eq.insurance_expiry, true, true));
  if (ins) issues.push({ ...base, id: `heavy-${eq.id}-insurance`, status: ins, problem: 'ביטוח' });

  if (eq.inspection_file_url || eq.inspection_expiry) {
    const is = toIssue(getDocumentStatus(eq.inspection_file_url, eq.inspection_expiry, false, true));
    if (is) issues.push({ ...base, id: `heavy-${eq.id}-inspection`, status: is, problem: 'תסקיר' });
  }

  return issues;
}

export function buildLiftingEquipmentIssues(eq: LiftingEquipment): Issue[] {
  const issues: Issue[] = [];
  const base = {
    entityType: 'lifting_equipment' as const,
    entityId: eq.id,
    entityName: eq.description,
    isManager: false,
    subcontractorId: eq.subcontractor_id,
    subcontractorName: eq.subcontractor?.name ?? null,
    href: `/lifting-equipment/${eq.id}`,
  };

  const is = toIssue(getDocumentStatus(eq.inspection_file_url, eq.inspection_expiry, true, true));
  if (is) issues.push({ ...base, id: `lifting-${eq.id}-inspection`, status: is, problem: 'בדיקה תקופתית' });

  return issues;
}

export function buildAllIssues(
  workers: WorkerWithDocuments[],
  vehicles: Vehicle[],
  heavyEquipment: HeavyEquipment[],
  liftingEquipment: LiftingEquipment[]
): Issue[] {
  // מיפוי מנהל → קבלן משנה: מאפשר פילטור רכבים דרך המנהל המשויך
  const managerSubMap = new Map<string, { id: string; name: string }>();
  for (const w of workers) {
    if (w.subcontractor_id && w.subcontractor?.name) {
      managerSubMap.set(w.id, { id: w.subcontractor_id, name: w.subcontractor.name });
    }
  }

  const vehicleIssues = vehicles.flatMap((v) => {
    const base = buildVehicleIssues(v);
    if (!v.assigned_manager_id || base.length === 0) return base;
    const managerSub = managerSubMap.get(v.assigned_manager_id);
    if (!managerSub) return base;
    // העשרה: שיוך לקבלן דרך המנהל — מאפשר פילטור עקיף
    return base.map((i) => ({ ...i, subcontractorId: managerSub.id, subcontractorName: managerSub.name }));
  });

  return [
    ...workers.flatMap(buildWorkerIssues),
    ...vehicleIssues,
    ...heavyEquipment.flatMap(buildHeavyEquipmentIssues),
    ...liftingEquipment.flatMap(buildLiftingEquipmentIssues),
  ];
}

export type EntityCounts = { urgent: number; expiring: number };

export function countByEntity(issues: Issue[], entityType: Issue['entityType'], managerOnly = false): EntityCounts {
  const worstByEntity = new Map<string, IssueStatus>();
  for (const issue of issues) {
    if (issue.entityType !== entityType) continue;
    if (managerOnly && !issue.isManager) continue;
    const cur = worstByEntity.get(issue.entityId);
    if (!cur || STATUS_SEVERITY[issue.status] > STATUS_SEVERITY[cur]) {
      worstByEntity.set(issue.entityId, issue.status);
    }
  }
  let urgent = 0, expiring = 0;
  for (const s of worstByEntity.values()) {
    if (s === 'expired' || s === 'missing') urgent++;
    else if (s === 'expiring_soon') expiring++;
  }
  return { urgent, expiring };
}
