import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('companies')
    .select('id, name, name_en, slug, registration, address, phone, contact_email, safety_email, logo_url, is_active, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const {
      name, name_en, slug, registration, address, phone,
      contact_email, safety_email, first_admin_user_id,
      is_active: isActiveInput, logo_url: logoUrl,
    } = body;

    // Validate payload format before business-rule checks.
    if (!name?.trim()) {
      return NextResponse.json({ error: 'שדה חובה חסר: name' }, { status: 400 });
    }

    if (!slug?.trim()) {
      return NextResponse.json({ error: 'שדה חובה חסר: slug' }, { status: 400 });
    }

    const isDraft  = isActiveInput === false;
    const hasAdmin = !!first_admin_user_id?.trim();

    // Client must be explicit: either provide a first admin (full flow) or
    // explicitly request a draft (is_active: false). Silent active creation
    // without an admin is blocked — orphaned active companies have no admin.
    if (!hasAdmin && !isDraft) {
      return NextResponse.json(
        { error: 'יש לבחור מנהל ראשון לחברה, או לשמור כטיוטה (is_active: false).' },
        { status: 400 }
      );
    }

    const normalizedSlug = slug.trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9-]+$/.test(normalizedSlug)) {
      return NextResponse.json({ error: 'slug חייב להכיל רק אותיות אנגלית קטנות, ספרות ומקפים' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', normalizedSlug)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'slug כבר קיים במערכת' }, { status: 409 });
    }

    // Always create inactive — activated below only after membership succeeds.
    // This guarantees the invariant: active company ⟹ has at least one admin member.
    const { data: company, error: insertError } = await supabase
      .from('companies')
      .insert({
        name: name.trim(),
        name_en: name_en?.trim() || null,
        slug: normalizedSlug,
        registration: registration?.trim() || null,
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        contact_email: contact_email?.trim() || null,
        safety_email: safety_email?.trim() || null,
        logo_url: logoUrl?.trim() || null,
        is_active: false,
        settings: {},
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.message.includes('unique') || insertError.message.includes('duplicate')) {
        return NextResponse.json({ error: 'slug כבר קיים במערכת' }, { status: 409 });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    if (!hasAdmin) {
      // Explicit draft — return inactive company as-is.
      return NextResponse.json(company, { status: 201 });
    }

    // ── Full flow: create membership then activate ────────────────────────────

    const adminUserId = first_admin_user_id.trim();

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id, is_active')
      .eq('id', adminUserId)
      .single();

    if (!adminProfile || !adminProfile.is_active) {
      await supabase.from('companies').delete().eq('id', company.id);
      return NextResponse.json(
        { error: 'המשתמש שצוין כמנהל ראשון לא נמצא או אינו פעיל — החברה לא נוצרה' },
        { status: 404 }
      );
    }

    // The assigned user gets company_members.role='admin'.
    // profiles.role (platform admin indicator) is NEVER modified here.
    const { error: memberError } = await supabase
      .from('company_members')
      .insert({ company_id: company.id, user_id: adminUserId, role: 'admin', is_active: true });

    if (memberError) {
      await supabase.from('companies').delete().eq('id', company.id);
      return NextResponse.json(
        { error: 'שגיאה בהוספת מנהל ראשון לחברה — החברה לא נוצרה' },
        { status: 500 }
      );
    }

    // Activate only after membership is confirmed — invariant preserved.
    const { data: activatedCompany, error: activateError } = await supabase
      .from('companies')
      .update({ is_active: true })
      .eq('id', company.id)
      .select()
      .single();

    if (activateError) {
      // Membership exists but activation failed — company stays inactive.
      // Platform admin can activate manually from company settings.
      return NextResponse.json({ error: 'שגיאה בהפעלת החברה — פנה לתמיכה' }, { status: 500 });
    }

    return NextResponse.json(activatedCompany, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
