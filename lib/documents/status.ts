import { differenceInDays, parseISO, startOfDay } from 'date-fns';
import {
  Document,
  DocumentStatus,
  DocumentType,
  SafetyBriefing,
  HeightRestriction,
  HeavyEquipment,
  LiftingEquipment,
  ProfessionalLicense,
  Vehicle,
  WorkerWithDocuments,
  REQUIRED_DOCUMENT_TYPES_FOR_FOREIGN,
  REQUIRED_DOCUMENT_TYPES_FOR_ISRAELI,
} from '@/types';

/**
 * חוק עסקי: אשרת עבודה לעובד זר — תמיד חובה, לא ניתן לשחרר.
 * משמש גם ב-UI (להסתיר כפתור) וגם ב-API (לכפות is_required=true).
 */
export function isWorkVisaLocked(docType: DocumentType, isForeignWorker: boolean): boolean {
  return docType === 'work_visa' && isForeignWorker;
}

/**
 * חוקי סטטוס מסמך — לוגיקה אחידה לכל הטבלאות:
 * - is_required=false → 'not_required' (תמיד, ללא תלות בקובץ או תאריך)
 * - אין קובץ → 'missing'
 * - יש קובץ + אין תאריך תוקף + requiresExpiry=true → 'missing'
 * - יש קובץ + אין תאריך תוקף + requiresExpiry=false → 'valid' (למשל: תעודת זהות)
 * - יש קובץ + תוקף פג → 'expired'
 * - יש קובץ + תוקף עד 14 יום → 'expiring_soon'
 * - יש קובץ + תוקף תקין → 'valid'
 */
export function getDocumentStatus(
  fileUrl: string | null,
  expiryDate: string | null,
  isRequired = true,
  requiresExpiry = true
): DocumentStatus {
  if (!isRequired) return 'not_required';
  if (!fileUrl) return 'missing';
  if (!expiryDate) return requiresExpiry ? 'missing' : 'valid';
  return statusFromExpiry(expiryDate);
}

/**
 * תאריך תוקף → סטטוס. תאריך שלא ניתן לפענח נחשב 'missing' (לא ניתן לאמת תוקף),
 * ולא 'valid' כפי שקרה קודם (השוואות NaN החזירו false).
 */
function statusFromExpiry(expiryDate: string): DocumentStatus {
  const parsed = parseISO(expiryDate);
  if (Number.isNaN(parsed.getTime())) return 'missing';

  const today = startOfDay(new Date());
  const daysLeft = differenceInDays(startOfDay(parsed), today);

  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 14) return 'expiring_soon';
  return 'valid';
}

/**
 * מקור אמת יחיד לסטטוס מסמך חובה של עובד (תעודת זהות / אשרת עבודה).
 * משמש גם את getWorkerStatus וגם את issues engine.
 * - תעודת זהות: חובה תמיד, קיום קובץ מספיק (אין תאריך תוקף).
 * - אשרת עבודה לעובד זר: חובה תמיד, גם אם נשמרה בעבר כ"לא נדרש" (isWorkVisaLocked).
 */
export function getWorkerRequiredDocStatus(
  isForeignWorker: boolean,
  docType: DocumentType,
  doc: Document | undefined
): DocumentStatus {
  if (docType === 'id_document') {
    return getDocumentStatus(doc?.file_url ?? null, null, true, false);
  }
  const isRequired = isWorkVisaLocked(docType, isForeignWorker) ? true : (doc ? doc.is_required !== false : true);
  return getDocumentStatus(doc?.file_url ?? null, doc?.expiry_date ?? null, isRequired, true);
}

/**
 * סטטוס איסור עבודה בגובה (HeightRestriction):
 */
export function getHeightRestrictionStatus(restriction: HeightRestriction | null | undefined): DocumentStatus {
  if (!restriction) return 'missing';
  return statusFromExpiry(restriction.expires_at);
}

/** רשומה ללא תאריך תוקף לא נחשבת תדריך שהושלם ואינה קובעת סטטוס נוכחי. */
export function isCompletedBriefing(briefing: SafetyBriefing): boolean {
  return Boolean(briefing.expires_at);
}

/**
 * מקור אמת יחיד לתדריך הנוכחי: התדריך האחרון שהושלם.
 * מיון: briefed_at (תאריך ביצוע) ↓, ואז created_at ↓, ואז id — דטרמיניסטי גם באותו יום.
 * תדריכים ישנים נשמרים כהיסטוריה ואינם קובעים את הסטטוס.
 */
export function getLatestCompletedSafetyBriefing(
  briefings: SafetyBriefing[] | null | undefined
): SafetyBriefing | null {
  const completed = (briefings ?? []).filter(isCompletedBriefing);
  completed.sort((a, b) => {
    const byDate = (b.briefed_at ?? '').localeCompare(a.briefed_at ?? '');
    if (byDate !== 0) return byDate;
    const byCreated = (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
    if (byCreated !== 0) return byCreated;
    return b.id.localeCompare(a.id);
  });
  return completed[0] ?? null;
}

/**
 * סטטוס תדריך בטיחות:
 */
export function getBriefingStatus(briefing: SafetyBriefing | null | undefined): DocumentStatus {
  if (!briefing) return 'missing';
  return statusFromExpiry(briefing.expires_at);
}

export const STATUS_SEVERITY: Record<DocumentStatus, number> = {
  expired: 3,
  missing: 3,       // חסר = חמור כמו פג תוקף
  expiring_soon: 1,
  valid: 0,
  not_required: 0,  // לא נדרש = לא פוגע בסטטוס
};

/**
 * לוגיקה משותפת: טוב יותר מבין אישור עבודה בגובה ואיסור עבודה בגובה.
 * משמשת גם את getWorkerStatus וגם את issues engine — מקור יחיד לחוק זה.
 */
export function getHeightCombinedStatus(
  heightPermitDoc: Document | undefined,
  heightRestrictions: HeightRestriction[]
): DocumentStatus {
  const permitStatus = getDocumentStatus(
    heightPermitDoc?.file_url ?? null,
    heightPermitDoc?.expiry_date ?? null,
    true,
    true
  );
  const latest = heightRestrictions
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
  const banStatus = getHeightRestrictionStatus(latest);
  return STATUS_SEVERITY[permitStatus] <= STATUS_SEVERITY[banStatus] ? permitStatus : banStatus;
}

export function getWorkerStatus(worker: WorkerWithDocuments): DocumentStatus {
  const requiredTypes =
    worker.is_foreign_worker
      ? REQUIRED_DOCUMENT_TYPES_FOR_FOREIGN
      : REQUIRED_DOCUMENT_TYPES_FOR_ISRAELI;

  const docMap = new Map<DocumentType, Document>(
    worker.documents
      .filter((d) => d.doc_type !== 'optional_license')
      .map((d) => [d.doc_type as DocumentType, d])
  );

  let worstStatus: DocumentStatus = 'valid';

  for (const docType of requiredTypes) {
    if (docType === 'height_permit') continue; // מטופל בנפרד עם לוגיקת permit+ban

    const status = getWorkerRequiredDocStatus(worker.is_foreign_worker, docType, docMap.get(docType));

    if (STATUS_SEVERITY[status] > STATUS_SEVERITY[worstStatus]) {
      worstStatus = status;
    }
  }

  // עבודה בגובה: permit OR ban — לוגיקה משותפת עם issues engine
  const heightPermitDoc = docMap.get('height_permit');
  const heightCombinedStatus = getHeightCombinedStatus(heightPermitDoc, worker.height_restrictions ?? []);
  if (STATUS_SEVERITY[heightCombinedStatus] > STATUS_SEVERITY[worstStatus]) {
    worstStatus = heightCombinedStatus;
  }

  const briefingStatus = getBriefingStatus(getLatestCompletedSafetyBriefing(worker.safety_briefings));
  if (STATUS_SEVERITY[briefingStatus] > STATUS_SEVERITY[worstStatus]) {
    worstStatus = briefingStatus;
  }

  // מינוי מפעיל מכונת הרמה — נדרש כשהעובד מסומן כמפעיל ואין אף מינוי
  if (
    worker.is_crane_operator &&
    (worker.lifting_machine_appointments ?? []).length === 0
  ) {
    if (STATUS_SEVERITY['missing'] > STATUS_SEVERITY[worstStatus]) {
      worstStatus = 'missing';
    }
  }

  // רישיונות מקצועיים — קובץ חובה; תאריך תוקף חובה רק אם הוזן
  for (const lic of (worker.professional_licenses ?? [])) {
    const licStatus = getDocumentStatus(lic.file_url, lic.expiry_date, true, !!lic.expiry_date);
    if (STATUS_SEVERITY[licStatus] > STATUS_SEVERITY[worstStatus]) {
      worstStatus = licStatus;
    }
  }

  // מנהל עבודה: רכב מטבלת vehicles (אופציונלי); נהיגה/מקצועיים מ-manager_licenses — תמיד
  if (worker.is_responsible_site_manager) {
    // רכבים — כל הרכבים הפעילים שאינם בארכיון; הסטטוס החמור ביותר (P1·5)
    for (const vehicle of getActiveManagerVehicles(worker)) {
      const vStatus = getVehicleStatus(vehicle);
      if (STATUS_SEVERITY[vStatus] > STATUS_SEVERITY[worstStatus]) worstStatus = vStatus;
    }

    // רישיון נהיגה + רישיונות מקצועיים של מנהל — נדרשים אם קיימים
    for (const lic of (worker.manager_licenses ?? [])) {
      const licStatus = getDocumentStatus(lic.file_url, lic.expiry_date, true, !!lic.expiry_date);
      if (STATUS_SEVERITY[licStatus] > STATUS_SEVERITY[worstStatus]) worstStatus = licStatus;
    }
  }

  return worstStatus;
}

export function getProfessionalLicenseStatus(license: ProfessionalLicense): DocumentStatus {
  return getDocumentStatus(license.file_url, license.expiry_date, true, !!license.expiry_date);
}

/** סטטוס כלי צמ"ה */
export function getHeavyEquipmentStatus(eq: HeavyEquipment): DocumentStatus {
  let worst: DocumentStatus = 'valid';

  // רישיון — נדרש תמיד (קובץ + תאריך חובה)
  const licStatus = getDocumentStatus(eq.license_file_url, eq.license_expiry, true, true);
  if (STATUS_SEVERITY[licStatus] > STATUS_SEVERITY[worst]) worst = licStatus;

  // ביטוחים: חובה — נדרש תמיד; מקיף/צד ג — אופציונלי (רק אם יש נתונים)
  const insurances = eq.heavy_equipment_insurances ?? [];
  const mandatory = insurances.find((i) => i.insurance_type === 'ביטוח חובה');
  const mandatoryStatus = getDocumentStatus(mandatory?.file_url ?? null, mandatory?.expiry_date ?? null, true, true);
  if (STATUS_SEVERITY[mandatoryStatus] > STATUS_SEVERITY[worst]) worst = mandatoryStatus;

  return worst;
}

/** סטטוס ציוד הרמה */
export function getLiftingEquipmentStatus(eq: LiftingEquipment): DocumentStatus {
  return getDocumentStatus(eq.inspection_file_url, eq.inspection_expiry, true, true);
}

export const STATUS_COLORS: Record<DocumentStatus, string> = {
  valid: 'bg-green-100 text-green-800 border-green-200',
  expiring_soon: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  expired: 'bg-red-100 text-red-800 border-red-200',
  missing: 'bg-red-100 text-red-800 border-red-200',
  not_required: 'bg-gray-100 text-gray-500 border-gray-200',
};

export const STATUS_DOT_COLORS: Record<DocumentStatus, string> = {
  valid: 'bg-green-500',
  expiring_soon: 'bg-yellow-500',
  expired: 'bg-red-500',
  missing: 'bg-red-500',
  not_required: 'bg-gray-400',
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  valid: 'תקין',
  expiring_soon: 'עומד לפוג',
  expired: 'פג תוקף',
  missing: 'חסר',
  not_required: 'לא נדרש',
};

/** סטטוס רכב: רישיון רכב + ביטוח חובה חובה; מקיף/צד ג אופציונליים */
/**
 * רכבי מנהל עבודה שנספרים לסטטוס שלו: פעילים ולא בארכיון (P1·5).
 * עד 2026-11-18 נספר רק הרכב הראשון ברשימה (ללא סדר מוגדר), כולל רכבים בארכיון.
 * שדה חסר (loader שלא שלף is_active / is_archived) נחשב פעיל — לא מסתירים ליקוי.
 */
export function getActiveManagerVehicles(worker: { vehicles?: Vehicle[] | null }): Vehicle[] {
  return (worker.vehicles ?? []).filter((v) => v.is_active !== false && v.is_archived !== true);
}

export function getVehicleStatus(vehicle: Vehicle): DocumentStatus {
  let worst: DocumentStatus = 'valid';

  const lic = (vehicle.vehicle_licenses ?? [])[0] ?? null;
  const licStatus = getDocumentStatus(lic?.file_url ?? null, lic?.expiry_date ?? null, true, true);
  if (STATUS_SEVERITY[licStatus] > STATUS_SEVERITY[worst]) worst = licStatus;

  const mandatoryIns = (vehicle.vehicle_insurances ?? []).find(
    (i) => i.insurance_type === 'ביטוח חובה'
  );
  const insStatus = getDocumentStatus(
    mandatoryIns?.file_url ?? null,
    mandatoryIns?.expiry_date ?? null,
    true,
    true
  );
  if (STATUS_SEVERITY[insStatus] > STATUS_SEVERITY[worst]) worst = insStatus;

  return worst;
}
