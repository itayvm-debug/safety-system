import * as XLSX from 'xlsx';
import { getWorkerIdentifierLabel, getWorkerIdentifierValue } from '@/lib/workers/identifier';
import { getDocumentStatus, STATUS_LABELS } from '@/lib/documents/status';
import type { WorkerWithDocuments } from '@/types';
import type { HeavyEquipment } from '@/types';

export function generateWorkersExcel(workers: WorkerWithDocuments[]): void {
  const rows = workers.map((w) => {
    const idDoc = w.documents.find((d) => d.doc_type === 'id_document');
    const visa = w.documents.find((d) => d.doc_type === 'work_visa');
    const heightPermit = w.documents.find((d) => d.doc_type === 'height_permit');
    const briefing = w.safety_briefings?.[0] ?? null;

    return {
      'שם מלא': w.full_name,
      [getWorkerIdentifierLabel(w)]: getWorkerIdentifierValue(w),
      'סוג': w.is_foreign_worker ? 'עובד זר' : 'ישראלי',
      'טלפון': w.phone ?? '',
      'פרויקט': w.project_name ?? '',
      'פעיל': w.is_active ? 'כן' : 'לא',
      'קבלן משנה': w.subcontractor?.name ?? '',
      'ת.ז. / תאריך תוקף': idDoc?.expiry_date ?? '',
      'תעודת גובה': STATUS_LABELS[getDocumentStatus(heightPermit?.file_url ?? null, heightPermit?.expiry_date ?? null)],
      'אשרת עבודה': w.is_foreign_worker
        ? STATUS_LABELS[getDocumentStatus(visa?.file_url ?? null, visa?.expiry_date ?? null)]
        : 'לא רלוונטי',
      'תדריך בטיחות': briefing
        ? STATUS_LABELS[getDocumentStatus(briefing.file_url, briefing.expires_at)]
        : 'חסר',
      'הערות': w.notes ?? '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [20, 15, 10, 15, 15, 8, 20, 15, 15, 15, 18, 25].map((w) => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'עובדים');
  XLSX.writeFile(wb, `עובדים_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.xlsx`);
}

export function generateEquipmentExcel(equipment: HeavyEquipment[]): void {
  const rows = equipment.map((eq) => ({
    'תיאור': eq.description,
    'מספר רישוי': eq.license_number ?? '',
    'קבלן משנה': eq.subcontractor?.name ?? '',
    'פרויקט': eq.project_name ?? '',
    'רישיון – תוקף': eq.license_expiry ?? '',
    'ביטוח – תוקף': eq.insurance_expiry ?? '',
    'בדיקה – תוקף': eq.inspection_expiry ?? '',
    'פעיל': eq.is_active ? 'כן' : 'לא',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [30, 15, 20, 15, 15, 15, 15, 8].map((w) => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'כלי צמ"ה');
  XLSX.writeFile(wb, `כלי_צמה_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.xlsx`);
}
