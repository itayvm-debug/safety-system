/**
 * DELETE /api/admin/users/[id]/mfa — a platform admin removes another user's two-factor
 * factor (lost phone). Not allowed on one's own account: recovery always needs a second admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';
import { auditLog } from '@/lib/audit/log';
import { clientIpOrNull } from '@/lib/rate-limit';
import { deleteFactor } from '@/lib/auth/mfa-store';

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requirePlatformAdmin();
  if (error) return error;
  const { id } = await params;

  if (id === session.userId) {
    return NextResponse.json({ error: 'לא ניתן לאפס אימות דו-שלבי של עצמך — פנה למנהל מערכת אחר' }, { status: 409 });
  }

  const service = createServiceClient();
  const { data: target } = await service.from('profiles').select('id, email').eq('id', id).maybeSingle();
  if (!target) return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });

  const removed = await deleteFactor(service, id);
  void auditLog({
    user_id: session.userId,
    user_email: session.email,
    action: 'mfa_reset',
    entity_type: 'user',
    entity_id: id,
    ip_address: clientIpOrNull(request),
  });
  return NextResponse.json({ reset: removed });
}
