import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export async function GET() {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('subcontractors')
    .select('*, responsible_worker:workers!subcontractors_responsible_worker_id_fkey(id, full_name)')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await request.json();
  const { name, contact_name, phone, notes } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'שם קבלן נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('subcontractors')
    .insert({
      name: name.trim(),
      contact_name: contact_name?.trim() || null,
      phone: phone?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
