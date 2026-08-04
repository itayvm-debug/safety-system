import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const supabase = createServiceClient();

  const [companyRes, memberCountRes] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name, name_en, slug, registration, address, phone, contact_email, safety_email, settings, is_active, created_at, updated_at')
      .eq('id', id)
      .single(),
    supabase
      .from('company_members')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', id)
      .eq('is_active', true),
  ]);

  if (companyRes.error || !companyRes.data) {
    return NextResponse.json({ error: 'חברה לא נמצאה' }, { status: 404 });
  }

  return NextResponse.json({
    ...companyRes.data,
    memberCount: memberCountRes.count ?? 0,
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  try {
    const body = await request.json();
    const allowed = ['name', 'name_en', 'slug', 'registration', 'address', 'phone', 'contact_email', 'safety_email', 'is_active', 'logo_url'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'לא נשלח שום שדה לעדכון' }, { status: 400 });
    }

    if ('slug' in updates) {
      const slug = String(updates.slug).trim().toLowerCase().replace(/\s+/g, '-');
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return NextResponse.json({ error: 'slug חייב להכיל רק אותיות אנגלית קטנות, ספרות ומקפים' }, { status: 400 });
      }
      updates.slug = slug;
    }

    if ('name' in updates && !String(updates.name ?? '').trim()) {
      return NextResponse.json({ error: 'שם החברה לא יכול להיות ריק' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: company, error: patchError } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (patchError) {
      if (patchError.message.includes('unique') || patchError.message.includes('duplicate')) {
        return NextResponse.json({ error: 'slug כבר קיים במערכת' }, { status: 409 });
      }
      if (patchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'חברה לא נמצאה' }, { status: 404 });
      }
      return NextResponse.json({ error: patchError.message }, { status: 500 });
    }

    return NextResponse.json(company);
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
