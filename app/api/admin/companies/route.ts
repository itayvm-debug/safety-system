import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = createServiceClient();
  const { data, error: dbError } = await supabase
    .from('companies')
    .select('id, name, name_en, slug, registration, address, phone, contact_email, safety_email, is_active, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const { name, name_en, slug, registration, address, phone, contact_email, safety_email, first_admin_user_id, is_active: isActiveInput } = body;

    // Rule: an active company must have a first admin.
    // Pass is_active: false to create a draft company without an admin.
    const isActive = isActiveInput !== false;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'שדה חובה חסר: name' }, { status: 400 });
    }

    if (!slug?.trim()) {
      return NextResponse.json({ error: 'שדה חובה חסר: slug' }, { status: 400 });
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

    // Active companies require a first admin to prevent orphaned companies.
    // Draft companies (is_active: false) may be created without one.
    if (isActive && !first_admin_user_id?.trim()) {
      return NextResponse.json(
        { error: 'חברה פעילה חייבת לכלול מנהל ראשון (first_admin_user_id). לחברת טיוטה, שלח is_active: false.' },
        { status: 400 }
      );
    }

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
        is_active: isActive,
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

    // Optional: assign a first company admin.
    // The assigned user gets company_members.role='admin' — a company-level role.
    // profiles.role (platform admin indicator) is NEVER modified here.
    if (first_admin_user_id?.trim()) {
      const adminUserId = first_admin_user_id.trim();

      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('id, is_active')
        .eq('id', adminUserId)
        .single();

      if (!adminProfile || !adminProfile.is_active) {
        // Compensate: remove the company we just created before returning the error
        await supabase.from('companies').delete().eq('id', company.id);
        return NextResponse.json(
          { error: 'המשתמש שצוין כמנהל ראשון לא נמצא או אינו פעיל — החברה לא נוצרה' },
          { status: 404 }
        );
      }

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
    }

    return NextResponse.json(company, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
