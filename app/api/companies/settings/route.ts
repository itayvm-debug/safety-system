import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { createServiceClient } from '@/lib/supabase/server';
import { CompanySettingsSchema, resolveCompanySettings } from '@/lib/company/settings';

export async function GET() {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('companies')
    .select('settings')
    .eq('id', context.companyId)
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: 'הגדרות לא נמצאו' }, { status: 404 });
  }

  return NextResponse.json(resolveCompanySettings(data.settings));
}

export async function PATCH(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;

  try {
    const body = await request.json();

    const parsed = CompanySettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'הגדרות לא תקינות', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Merge with existing settings (deep merge at section level)
    const { data: existing } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', context.companyId)
      .single();

    const currentSettings = (existing?.settings ?? {}) as Record<string, unknown>;
    const newSettings: Record<string, unknown> = { ...currentSettings };

    if (parsed.data.branding !== undefined) {
      newSettings.branding = { ...(currentSettings.branding as object ?? {}), ...parsed.data.branding };
    }
    if (parsed.data.features !== undefined) {
      newSettings.features = { ...(currentSettings.features as object ?? {}), ...parsed.data.features };
    }
    if (parsed.data.ui !== undefined) {
      newSettings.ui = { ...(currentSettings.ui as object ?? {}), ...parsed.data.ui };
    }

    const { data: updated, error: updateError } = await supabase
      .from('companies')
      .update({ settings: newSettings })
      .eq('id', context.companyId)
      .select('settings')
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json(resolveCompanySettings(updated.settings));
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
