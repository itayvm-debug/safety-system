import * as XLSX from 'xlsx';
import type { WorkerWithDocuments, Vehicle, HeavyEquipment, LiftingEquipment } from '@/types';
import type { Issue } from '@/lib/documents/issues';
import { getWorkerIdentifierValue } from '@/lib/workers/identifier';
import {
  getDocumentStatus,
  getWorkerStatus,
  getVehicleStatus,
  getHeavyEquipmentStatus,
  getLiftingEquipmentStatus,
  getBriefingStatus,
  getHeightCombinedStatus,
  STATUS_LABELS,
} from '@/lib/documents/status';

// ─── Helper: בניית גיליון עם שורת כותרת ─────────────────────
function makeSheet(
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  colWidths: number[]
): XLSX.WorkSheet {
  const date = new Date().toLocaleDateString('he-IL');
  const data: unknown[][] = [
    [title, '', `תאריך הפקה: ${date}`, '', `סה"כ רשומות: ${rows.length}`],
    [],
    headers,
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = colWidths.map((w) => ({ wch: w }));
  return ws;
}

function todayStr(): string {
  return new Date().toLocaleDateString('he-IL').replace(/\//g, '-');
}

// ─── עובדים ───────────────────────────────────────────────────
export function generateWorkersExcel(workers: WorkerWithDocuments[], reportTitle = 'עובדים'): void {
  const rows = workers.map((w) => {
    const docMap = new Map(w.documents.map((d) => [d.doc_type, d]));
    const idDoc = docMap.get('id_document');
    const visa = docMap.get('work_visa');
    const heightPermit = docMap.get('height_permit');
    const latestBriefing = (w.safety_briefings ?? [])
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

    const heightStatus = STATUS_LABELS[getHeightCombinedStatus(heightPermit, w.height_restrictions ?? [])];
    const briefingStatus = STATUS_LABELS[getBriefingStatus(latestBriefing)];
    const overallStatus = STATUS_LABELS[getWorkerStatus(w)];

    return [
      w.full_name,
      getWorkerIdentifierValue(w),
      w.is_foreign_worker ? 'עובד זר' : 'ישראלי',
      w.subcontractor?.name ?? '',
      w.phone ?? '',
      w.project_name ?? '',
      idDoc?.file_url ? 'הועלה' : STATUS_LABELS['missing'],
      heightStatus,
      w.is_foreign_worker
        ? STATUS_LABELS[getDocumentStatus(visa?.file_url ?? null, visa?.expiry_date ?? null, true, true)]
        : '—',
      briefingStatus,
      overallStatus,
      w.is_active ? 'פעיל' : 'לא פעיל',
      w.notes ?? '',
    ];
  });

  const headers = [
    'שם מלא', 'מספר מזהה', 'סוג עובד', 'קבלן משנה',
    'טלפון', 'פרויקט',
    'תעודת זהות', 'עבודה בגובה', 'אשרת עבודה', 'תדריך בטיחות',
    'סטטוס כולל', 'פעיל', 'הערות',
  ];
  const colWidths = [22, 14, 10, 20, 13, 16, 12, 14, 13, 16, 12, 8, 25];

  const ws = makeSheet(reportTitle, headers, rows, colWidths);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, reportTitle.substring(0, 31));
  XLSX.writeFile(wb, `${reportTitle}_${todayStr()}.xlsx`);
}

// ─── רכבים ────────────────────────────────────────────────────
export function generateVehiclesExcel(vehicles: Vehicle[]): void {
  const rows = vehicles.map((v) => {
    const lic = (v.vehicle_licenses ?? [])[0] ?? null;
    const mandatory = (v.vehicle_insurances ?? []).find((i) => i.insurance_type === 'ביטוח חובה');
    const comp = (v.vehicle_insurances ?? []).find((i) => i.insurance_type === 'ביטוח מקיף');
    const third = (v.vehicle_insurances ?? []).find((i) => i.insurance_type === 'ביטוח צד ג');
    const status = STATUS_LABELS[getVehicleStatus(v)];

    return [
      v.vehicle_type,
      v.model ?? '',
      v.vehicle_number,
      v.vehicle_color ?? '',
      v.assigned_manager?.full_name ?? '',
      v.project_name ?? '',
      lic?.expiry_date ?? '',
      mandatory?.expiry_date ?? '',
      comp?.expiry_date ?? '',
      third?.expiry_date ?? '',
      status,
      v.is_active ? 'פעיל' : 'לא פעיל',
      v.notes ?? '',
    ];
  });

  const headers = [
    'סוג רכב', 'דגם', 'מספר רכב', 'צבע', 'עובד משויך', 'פרויקט',
    'רישיון — תוקף', 'ביטוח חובה — תוקף', 'ביטוח מקיף — תוקף', 'ביטוח צד ג — תוקף',
    'סטטוס', 'פעיל', 'הערות',
  ];
  const colWidths = [12, 16, 12, 10, 20, 16, 14, 18, 16, 14, 12, 8, 20];

  const ws = makeSheet('רכבים', headers, rows, colWidths);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'רכבים');
  XLSX.writeFile(wb, `רכבים_${todayStr()}.xlsx`);
}

// ─── כלי צמ"ה ─────────────────────────────────────────────────
export function generateEquipmentExcel(equipment: HeavyEquipment[]): void {
  const rows = equipment.map((eq) => {
    const licStatus = STATUS_LABELS[getDocumentStatus(eq.license_file_url, eq.license_expiry, true, true)];
    const insStatus = STATUS_LABELS[getDocumentStatus(eq.insurance_file_url, eq.insurance_expiry, true, true)];
    const overall = STATUS_LABELS[getHeavyEquipmentStatus(eq)];

    return [
      eq.description,
      eq.license_number ?? '',
      eq.subcontractor?.name ?? '',
      eq.project_name ?? '',
      eq.license_expiry ?? '',
      licStatus,
      eq.insurance_expiry ?? '',
      insStatus,
      eq.inspection_expiry ?? '',
      overall,
      eq.is_active ? 'פעיל' : 'לא פעיל',
    ];
  });

  const headers = [
    'תיאור', 'מספר רישוי', 'קבלן משנה', 'פרויקט',
    'רישיון — תוקף', 'סטטוס רישיון',
    'ביטוח — תוקף', 'סטטוס ביטוח',
    'בדיקה תקופתית — תוקף',
    'סטטוס כולל', 'פעיל',
  ];
  const colWidths = [30, 14, 20, 16, 14, 14, 14, 14, 20, 12, 8];

  const ws = makeSheet('כלי צמ"ה', headers, rows, colWidths);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'כלי צמ"ה');
  XLSX.writeFile(wb, `כלי_צמה_${todayStr()}.xlsx`);
}

// ─── ציוד הרמה ────────────────────────────────────────────────
export function generateLiftingEquipmentExcel(equipment: LiftingEquipment[]): void {
  const rows = equipment.map((eq) => {
    const status = STATUS_LABELS[getLiftingEquipmentStatus(eq)];
    return [
      eq.description,
      eq.subcontractor?.name ?? '',
      eq.project_name ?? '',
      eq.inspection_expiry ?? '',
      status,
      eq.is_active ? 'פעיל' : 'לא פעיל',
    ];
  });

  const headers = ['תיאור', 'קבלן משנה', 'פרויקט', 'בדיקה תקופתית — תוקף', 'סטטוס', 'פעיל'];
  const colWidths = [30, 20, 16, 20, 12, 8];

  const ws = makeSheet('ציוד הרמה', headers, rows, colWidths);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ציוד הרמה');
  XLSX.writeFile(wb, `ציוד_הרמה_${todayStr()}.xlsx`);
}

// ─── דורש טיפול ───────────────────────────────────────────────
export function generateIssuesExcel(issues: Issue[], reportTitle = 'דורש טיפול'): void {
  const ENTITY_LABELS: Record<Issue['entityType'], string> = {
    worker: 'עובד',
    vehicle: 'רכב',
    heavy_equipment: 'כלי צמ"ה',
    lifting_equipment: 'ציוד הרמה',
  };
  const STATUS_LABEL: Record<Issue['status'], string> = {
    expired: 'פג תוקף',
    expiring_soon: 'עומד לפוג',
    missing: 'חסר',
  };

  const rows = issues.map((i) => [
    ENTITY_LABELS[i.entityType],
    i.entityName,
    i.problem,
    STATUS_LABEL[i.status],
    i.subcontractorName ?? '',
    i.managerName ?? '',
  ]);

  const headers = ['סוג ישות', 'שם', 'ליקוי', 'סטטוס', 'קבלן משנה', 'מנהל עבודה'];
  const colWidths = [14, 24, 26, 12, 22, 22];

  const ws = makeSheet(reportTitle, headers, rows, colWidths);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, reportTitle.substring(0, 31));
  XLSX.writeFile(wb, `${reportTitle}_${todayStr()}.xlsx`);
}
