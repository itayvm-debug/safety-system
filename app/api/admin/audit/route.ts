import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get('page') ?? '1'));
  const search = params.get('search') ?? '';
  const action = params.get('action') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const supabase = createServiceClient();
  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (search) {
    // הסרת תווים מיוחדים של PostgREST למניעת filter injection
    const safeSearch = search.replace(/[(),'"`\\]/g, '').trim();
    if (safeSearch) {
      query = query.or(`user_email.ilike.%${safeSearch}%,action.ilike.%${safeSearch}%,entity_id.ilike.%${safeSearch}%`);
    }
  }
  if (action) {
    query = query.eq('action', action);
  }
  if (from) {
    query = query.gte('created_at', from);
  }
  if (to) {
    // כולל את כל היום
    query = query.lte('created_at', `${to}T23:59:59.999Z`);
  }

  const { data, count, error: dbError } = await query;

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({
    logs: data ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  });
}
