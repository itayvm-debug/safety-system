import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export async function GET() {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('site_feedback')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const body = await request.json();
  const { full_name, subject, content } = body;

  if (!full_name?.trim()) return NextResponse.json({ error: 'שם מלא נדרש' }, { status: 400 });
  if (!subject?.trim()) return NextResponse.json({ error: 'נושא נדרש' }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: 'תוכן נדרש' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('site_feedback')
    .insert({
      full_name: full_name.trim(),
      subject: subject.trim(),
      content: content.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
