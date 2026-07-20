import { z } from 'zod';

// ── Shared primitives ──────────────────────────────────────────────────────

export const HebrewText = z.string().min(1).max(200).trim();
export const OptionalText = z.string().max(500).trim().optional().nullable();
export const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'פורמט תאריך לא תקין (YYYY-MM-DD)');
export const UUIDv4 = z.string().uuid('מזהה לא תקין');
export const PhoneIL = z.string().regex(/^0[1-9]\d{7,8}$/, 'מספר טלפון לא תקין').optional().nullable();
export const EmailAddress = z.string().email('כתובת דואל לא תקינה').optional().nullable();

// ── Authentication ─────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  username: z.string().min(1, 'שם משתמש נדרש').max(50).trim(),
  password: z.string().min(1, 'סיסמה נדרשת').max(200),
});

// ── Workers ────────────────────────────────────────────────────────────────

export const WorkerTypeSchema = z.enum(['israeli', 'foreign']);

export const CreateWorkerSchema = z.object({
  full_name:       HebrewText,
  worker_type:     WorkerTypeSchema,
  id_number:       z.string().min(1).max(20).trim().optional().nullable(),
  phone:           PhoneIL,
  subcontractor_id: UUIDv4.optional().nullable(),
  notes:           OptionalText,
});

export const UpdateWorkerSchema = CreateWorkerSchema.partial();

// ── Documents ──────────────────────────────────────────────────────────────

export const DocumentTypeSchema = z.enum([
  'id_document',
  'height_permit',
  'work_visa',
  'other',
]);

export const CreateDocumentSchema = z.object({
  worker_id:    UUIDv4,
  doc_type:     DocumentTypeSchema,
  file_path:    z.string().min(1).max(500),
  expiry_date:  ISODate.optional().nullable(),
  notes:        OptionalText,
});

// ── Vehicles ───────────────────────────────────────────────────────────────

export const CreateVehicleSchema = z.object({
  plate_number:   z.string().min(1).max(20).trim(),
  vehicle_type:   z.string().min(1).max(100).trim(),
  model:          OptionalText,
  year:           z.number().int().min(1950).max(2100).optional().nullable(),
  subcontractor_id: UUIDv4.optional().nullable(),
  notes:          OptionalText,
});

// ── Heavy Equipment ────────────────────────────────────────────────────────

export const CreateHeavyEquipmentSchema = z.object({
  equipment_number: z.string().min(1).max(50).trim(),
  equipment_type:   z.string().min(1).max(100).trim(),
  manufacturer:     OptionalText,
  model:            OptionalText,
  subcontractor_id: UUIDv4.optional().nullable(),
  notes:            OptionalText,
});

// ── Lifting Equipment ──────────────────────────────────────────────────────

export const CreateLiftingEquipmentSchema = z.object({
  equipment_number: z.string().min(1).max(50).trim(),
  equipment_type:   z.string().min(1).max(100).trim(),
  manufacturer:     OptionalText,
  serial_number:    OptionalText,
  subcontractor_id: UUIDv4.optional().nullable(),
  notes:            OptionalText,
});

// ── Subcontractors ─────────────────────────────────────────────────────────

export const CreateSubcontractorSchema = z.object({
  name:                  HebrewText,
  contact_name:          OptionalText,
  phone:                 PhoneIL,
  notes:                 OptionalText,
  responsible_worker_id: UUIDv4.optional().nullable(),
});

// ── Admin: Users ───────────────────────────────────────────────────────────

export const UserRoleSchema = z.enum(['admin', 'user']);

export const CreateUserSchema = z.object({
  full_name:  HebrewText,
  username:   z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/, 'שם משתמש: אותיות קטנות, ספרות, מקף, קו תחתי בלבד').trim(),
  email:      EmailAddress,
  password:   z.string().min(8, 'הסיסמה חייבת להכיל לפחות 8 תווים').max(100),
  role:       UserRoleSchema,
  job_title:  OptionalText,
});

export const UpdateUserSchema = z.object({
  full_name:   HebrewText.optional(),
  role:        UserRoleSchema.optional(),
  job_title:   OptionalText,
  is_active:   z.boolean().optional(),
  report_email: EmailAddress,
});

// ── Legal consent ──────────────────────────────────────────────────────────

export const LegalConsentSchema = z.object({
  accepted_terms:   z.literal(true, 'יש לאשר את תנאי השימוש'),
  accepted_privacy: z.literal(true, 'יש לאשר את מדיניות הפרטיות'),
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Parse and return typed data, or throw a 400 NextResponse on failure */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues.map(e => e.message).join('; ');
    throw Object.assign(new Error(messages), { zodError: result.error, statusCode: 400 });
  }
  return result.data;
}
