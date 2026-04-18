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
  WorkerWithDocuments,
  REQUIRED_DOCUMENT_TYPES_FOR_FOREIGN,
  REQUIRED_DOCUMENT_TYPES_FOR_ISRAELI,
} from '@/types';

/**
 * חוקי סטטוס מסמך — לוגיקה אחידה לכל הטבלאות:
 * - is_required=false + אין קובץ → 'not_required'
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
  if (!fileUrl) return isRequired ? 'missing' : 'not_required';
  if (!expiryDate) return requiresExpiry ? 'missing' : 'valid';

  const today = startOfDay(new Date());
  const expiry = startOfDay(parseISO(expiryDate));
  const daysLeft = differenceInDays(expiry, today);

  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 14) return 'expiring_soon';
  return 'valid';
}

/**
 * סטטוס איסור עבודה בגובה (HeightRestriction):
 */
export function getHeightRestrictionStatus(restriction: HeightRestriction | null | undefined): DocumentStatus {
  if (!restriction) return 'missing';

  const today = startOfDay(new Date());
  const expiry = startOfDay(parseISO(restriction.expires_at));
  const daysLeft = differenceInDays(expiry, today);

  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 14) return 'expiring_soon';
  return 'valid';
}

/**
 * סטטוס תדריך בטיחות:
 */
export function getBriefingStatus(briefing: SafetyBriefing | null | undefined): DocumentStatus {
  if (!briefing) return 'missing';

  const today = startOfDay(new Date());
  const expiry = startOfDay(parseISO(briefing.expires_at));
  const daysLeft = differenceInDays(expiry, today);

  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 14) return 'expiring_soon';
  return 'valid';
}

const STATUS_SEVERITY: Record<DocumentStatus, number> = {
  expired: 3,
  missing: 3,       // חסר = חמור כמו פג תוקף
  expiring_soon: 1,
  valid: 0,
  not_required: 0,  // לא נדרש = לא פוגע בסטטוס
};

export function getWorkerStatus(worker: WorkerWithDocuments): DocumentStatus {
  const requiredTypes =
    worker.worker_type === 'foreign'
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

    const doc = docMap.get(docType);
    // תעודת זהות: תמיד חובה ואין תאריך תוקף — רק קיום קובץ
    const isRequired = docType === 'id_document' ? true : (doc ? doc.is_required !== false : true);
    const expiryDate = docType === 'id_document' ? null : (doc?.expiry_date ?? null);
    // id_document: קיום קובץ מספיק — אין תאריך תוקף
    const requiresExpiry = docType !== 'id_document';
    const status = getDocumentStatus(doc?.file_url ?? null, expiryDate, isRequired, requiresExpiry);

    if (STATUS_SEVERITY[status] > STATUS_SEVERITY[worstStatus]) {
      worstStatus = status;
    }
  }

  // עבודה בגובה: לוגיקה משולבת — permit OR ban (מספיק שאחד מהם תקף)
  const heightPermitDoc = docMap.get('height_permit');
  const heightPermitStatus = getDocumentStatus(
    heightPermitDoc?.file_url ?? null,
    heightPermitDoc?.expiry_date ?? null,
    true // height_permit תמיד נדרש
  );

  const latestRestriction =
    (worker.height_restrictions ?? []).slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0] ?? null;
  const heightBanStatus = getHeightRestrictionStatus(latestRestriction);

  // לוקחים את הסטטוס הטוב יותר מבין השניים (הפחות חמור)
  const heightCombinedStatus: DocumentStatus =
    STATUS_SEVERITY[heightPermitStatus] <= STATUS_SEVERITY[heightBanStatus]
      ? heightPermitStatus
      : heightBanStatus;

  if (STATUS_SEVERITY[heightCombinedStatus] > STATUS_SEVERITY[worstStatus]) {
    worstStatus = heightCombinedStatus;
  }

  // תדריך בטיחות — הכי עדכני לפי created_at
  const latestBriefing =
    (worker.safety_briefings ?? []).slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0] ?? null;

  const briefingStatus = getBriefingStatus(latestBriefing);
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

  // רישיונות מקצועיים — רישיון עם תאריך תוקף שעומד לפוג/פג משפיע על הסטטוס
  for (const lic of (worker.professional_licenses ?? [])) {
    if (!lic.expiry_date) continue;
    const licStatus = getDocumentStatus(lic.file_url, lic.expiry_date, true, true);
    if (STATUS_SEVERITY[licStatus] > STATUS_SEVERITY[worstStatus]) {
      worstStatus = licStatus;
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

  // רישיון וביטוח — נדרשים תמיד (קובץ + תאריך חובה)
  const requiredFields: Array<{ file: string | null; expiry: string | null }> = [
    { file: eq.license_file_url, expiry: eq.license_expiry },
    { file: eq.insurance_file_url, expiry: eq.insurance_expiry },
  ];
  for (const { file, expiry } of requiredFields) {
    const s = getDocumentStatus(file, expiry, true, true);
    if (STATUS_SEVERITY[s] > STATUS_SEVERITY[worst]) worst = s;
  }

  // תסקיר — אופציונלי: אם הועלה קובץ, חייב להיות עם תאריך תקין
  if (eq.inspection_file_url || eq.inspection_expiry) {
    const s = getDocumentStatus(eq.inspection_file_url, eq.inspection_expiry, false, true);
    if (STATUS_SEVERITY[s] > STATUS_SEVERITY[worst]) worst = s;
  }

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
  expired: 'לא תקין',
  missing: 'לא תקין',
  not_required: 'לא נדרש',
};
