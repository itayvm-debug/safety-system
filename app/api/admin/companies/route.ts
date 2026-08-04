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
  const { session, error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const {
      name, name_en, slug, registration, address, phone,
      contact_email, safety_email, logo_url: logoUrl,
    } = body;

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

    // Always create inactive — activated only after membership succeeds.
    // Invariant: active company ⟹ has at least one member.
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

    // Auto-assign the current platform admin as first Owner.
    // Platform admins are allowed to belong to multiple companies.
    // profiles.role is NEVER modified — only company_members.role is set here.
    const { error: memberError } = await supabase
      .from('company_members')
      .insert({ company_id: company.id, user_id: session.userId, role: 'owner', is_active: true });

    if (memberError) {
      await supabase.from('companies').delete().eq('id', company.id);
      return NextResponse.json(
        { error: 'שגיאה בהוספת בעלים ראשון לחברה — החברה לא נוצרה' },
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
      return NextResponse.json({ error: 'שגיאה בהפעלת החברה — פנה לתמיכה' }, { status: 500 });
    }

    return NextResponse.json(activatedCompany, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
