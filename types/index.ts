export type WorkerType = 'israeli' | 'foreign';

export interface Subcontractor {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentType =
  | 'id_document'
  | 'height_permit'
  | 'work_visa'
  | 'optional_license';

export type DocumentStatus = 'valid' | 'expiring_soon' | 'expired' | 'missing' | 'not_required';

export type BriefingLanguage = 'hebrew' | 'arabic' | 'english' | 'russian' | 'thai';

export interface Worker {
  id: string;
  full_name: string;
  id_number: string;
  worker_type: WorkerType;
  phone: string | null;
  notes: string | null;
  photo_url: string | null;
  is_active: boolean;
  is_crane_operator: boolean;
  project_name: string | null;
  subcontractor_id: string | null;
  subcontractor?: Pick<Subcontractor, 'id' | 'name'> | null;
  // שדות נוספים למינוי מפעיל מכונת הרמה
  father_name: string | null;
  birth_year: number | null;
  profession: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  worker_id: string;
  doc_type: DocumentType;
  license_name: string | null; // רק עבור optional_license
  file_url: string | null;
  expiry_date: string | null;
  is_required: boolean;
  uploaded_at: string;
  updated_at: string;
}

export interface SafetyBriefing {
  id: string;
  worker_id: string;
  mode: 'system' | 'external';
  language: BriefingLanguage | null;
  conducted_by: string | null;
  signature_url: string | null;
  file_url: string | null;
  briefed_at: string;
  expires_at: string;
  created_at: string;
}

export interface HeightRestriction {
  id: string;
  worker_id: string;
  language: BriefingLanguage;
  conducted_by: string | null;
  signature_url: string | null;
  file_url: string | null;
  issued_at: string;
  expires_at: string;
  created_at: string;
}

export interface WorkerWithDocuments extends Worker {
  documents: Document[];
  safety_briefings: SafetyBriefing[];
  height_restrictions: HeightRestriction[];
  lifting_machine_appointments: LiftingMachineAppointment[];
}

export type PowerType = 'mechanical' | 'electric' | 'hydraulic' | 'pneumatic';

export const POWER_TYPE_LABELS: Record<PowerType, string> = {
  mechanical: 'כוח מכני',
  electric: 'חשמלי',
  hydraulic: 'הידראולי',
  pneumatic: 'פנאומטי',
};

export interface HeavyEquipment {
  id: string;
  description: string;
  license_number: string | null;
  image_url: string | null;
  license_file_url: string | null;
  license_expiry: string | null;
  insurance_file_url: string | null;
  insurance_expiry: string | null;
  inspection_file_url: string | null;
  inspection_expiry: string | null;
  subcontractor_id: string | null;
  subcontractor?: Pick<Subcontractor, 'id' | 'name'> | null;
  project_name: string | null;
  is_active: boolean;
  // שדות לטופס מינוי מפעיל
  manufacturer: string | null;
  machine_identifier: string | null;
  safe_working_load: string | null;
  power_type: PowerType | null;
  created_at: string;
  updated_at: string;
}

export interface LiftingMachineAppointment {
  id: string;
  worker_id: string;
  equipment_id: string | null;
  machine_name: string;
  manufacturer: string | null;
  machine_identifier: string | null;
  safe_working_load: string | null;
  power_type: PowerType | null;
  appointer_name: string;
  appointer_role: string | null;
  appointer_phone: string | null;
  appointer_address: string | null;
  appointer_zip: string | null;
  appointment_date: string;
  operator_signature_url: string | null;
  appointer_signature_url: string | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiftingEquipment {
  id: string;
  description: string;
  image_url: string | null;
  inspection_file_url: string | null;
  inspection_expiry: string | null;
  subcontractor_id: string | null;
  subcontractor?: Pick<Subcontractor, 'id' | 'name'> | null;
  project_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const DOCUMENT_TYPE_LABELS: Record<Exclude<DocumentType, 'optional_license'>, string> = {
  id_document: 'תעודת זהות',
  height_permit: 'אישור עבודה בגובה',
  work_visa: 'אשרת עבודה',
};

export const WORKER_TYPE_LABELS: Record<WorkerType, string> = {
  israeli: 'ישראלי',
  foreign: 'עובד זר',
};

export const REQUIRED_DOCUMENT_TYPES: Exclude<DocumentType, 'optional_license'>[] = [
  'id_document',
  'height_permit',
  'work_visa',
];

export const REQUIRED_DOCUMENT_TYPES_FOR_FOREIGN: Exclude<DocumentType, 'optional_license'>[] = [
  'id_document',
  'height_permit',
  'work_visa',
];

export const REQUIRED_DOCUMENT_TYPES_FOR_ISRAELI: Exclude<DocumentType, 'optional_license'>[] = [
  'id_document',
  'height_permit',
];

export const ALL_DOCUMENT_TYPES: Exclude<DocumentType, 'optional_license'>[] = [
  'id_document',
  'height_permit',
  'work_visa',
];

export const BRIEFING_LANGUAGE_LABELS: Record<BriefingLanguage, string> = {
  hebrew: 'עברית',
  arabic: 'ערבית',
  english: 'אנגלית',
  russian: 'רוסית',
  thai: 'תאילנדית',
};

// נוסח אישור העובד בשפת האם
export const BRIEFING_ACKNOWLEDGMENT: Record<BriefingLanguage, string> = {
  hebrew: 'קראתי והבנתי את הוראות הבטיחות. אני מתחייב/ת לפעול לפיהן ולדווח על כל מצב מסוכן.',
  arabic: 'لقد قرأت تعليمات السلامة وفهمتها. أتعهد بالعمل وفقاً لها والإبلاغ عن أي حالة خطر.',
  english: 'I have read and understood the safety instructions. I commit to act accordingly and report any hazardous situation.',
  russian: 'Я прочитал(а) и понял(а) инструкции по технике безопасности. Обязуюсь соблюдать их и сообщать об опасных ситуациях.',
  thai: 'ฉันได้อ่านและเข้าใจคำแนะนำด้านความปลอดภัยแล้ว ฉันให้คำมั่นสัญญาว่าจะปฏิบัติตามและรายงานสถานการณ์อันตรายใดๆ',
};
