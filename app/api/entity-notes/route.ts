import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/api';

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entity_type');
  const entityId   = searchParams.get('entity_id');

  if (!entityType || !entityId)
    return NextResponse.json({ error: 'entity_type ו-entity_id נדרשים' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('entity_notes')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { error: authError, session } = await requireAuth();
  if (authError) return authError;

  const body = await request.json();
  const { entity_type, entity_id, content, status } = body;

  if (!entity_type || !entity_id) return NextResponse.json({ error: 'entity_type ו-entity_id נדרשים' }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: 'תוכן ההערה נדרש' }, { status: 400 });

  const validTypes = ['worker', 'vehicle', 'heavy_equipment', 'lifting_equipment', 'subcontractor'];
  if (!validTypes.includes(entity_type)) return NextResponse.json({ error: 'סוג ישות לא תקין' }, { status: 400 });

  const validStatuses = ['ok', 'needs_attention'];
  const noteStatus = validStatuses.includes(status) ? status : 'ok';

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('entity_notes')
    .insert({
      entity_type,
      entity_id,
      content: content.trim(),
      status: noteStatus,
      created_by: session?.username ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
