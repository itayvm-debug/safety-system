import { createServiceClient } from '@/lib/supabase/server';

export type AuditAction =
  // ── Authentication ───────────────────────────────────────────────
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'access_denied'
  | 'rate_limit_triggered'
  | 'password_reset_initiated'
  // ── Workers ──────────────────────────────────────────────────────
  | 'worker.create'
  | 'worker.update'
  | 'worker.archive'
  | 'worker.unarchive'
  | 'entity_permanently_deleted'
  // ── Documents ────────────────────────────────────────────────────
  | 'document.upload'
  | 'document.delete'
  | 'document_downloaded'
  | 'document_replaced'
  // ── Vehicles ─────────────────────────────────────────────────────
  | 'vehicle.create'
  | 'vehicle.update'
  | 'vehicle.archive'
  // ── Heavy Equipment ──────────────────────────────────────────────
  | 'heavy_equipment.create'
  | 'heavy_equipment.update'
  | 'heavy_equipment.archive'
  // ── Lifting Equipment ────────────────────────────────────────────
  | 'lifting_equipment.create'
  | 'lifting_equipment.update'
  | 'lifting_equipment.archive'
  // ── Subcontractors ───────────────────────────────────────────────
  | 'subcontractor.create'
  | 'subcontractor.update'
  | 'subcontractor.archive'
  // ── Safety ───────────────────────────────────────────────────────
  | 'safety_briefing.create'
  | 'lifting_appointment.create'
  // ── Reports & Exports ────────────────────────────────────────────
  | 'report_exported'
  | 'weekly_report_sent'
  | 'system_export_created'
  | 'export.generate'
  // ── Legal ────────────────────────────────────────────────────────
  | 'legal_consent.accept'
  // ── Admin ────────────────────────────────────────────────────────
  | 'admin.user_create'
  | 'admin.user_update'
  | 'admin.phone_add'
  | 'admin.phone_remove'
  | 'user_disabled'
  | 'user_reactivated';

export interface AuditLogEntry {
  user_id: string | null;
  user_email: string | null;
  action: AuditAction;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
}

/**
 * כותב רשומת audit log — fire-and-forget (לא זורק exception)
 * יש לקרוא מ-API routes בלבד (server-side)
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('audit_logs').insert({
      user_id: entry.user_id ?? null,
      user_email: entry.user_email ?? null,
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      metadata: entry.metadata ?? null,
      ip_address: entry.ip_address ?? null,
    });

    if (error) {
      console.error('[audit] failed to write log:', error.message, { entry });
    }
  } catch (err) {
    console.error('[audit] unexpected error:', err, { entry });
  }
}
