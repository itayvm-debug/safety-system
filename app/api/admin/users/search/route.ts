import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimitDb } from '@/lib/rate-limit/db';

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

export async function GET(request: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      { error: `חיפוש חייב להכיל לפחות ${MIN_QUERY_LENGTH} תווים` },
      { status: 400 }
    );
  }

  // Rate limit: 60 searches per minute per platform admin — prevents bulk enumeration.
  const rl = await checkRateLimitDb(session.userId, 'user-search', 60, 60, undefined, session.userId);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'יותר מדי חיפושים. נסה שנית בעוד שניות.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  const supabase = createServiceClient();
  const pattern = `%${q}%`;

  // Return only safe fields — no platform role, no report_email, no job_title.
  // Searching active users only: inactive accounts cannot be company admins.
  const { data: profiles, error: dbError } = await supabase
    .from('profiles')
    .select('id, full_name, username, email, is_active')
    .or(`email.ilike.${pattern},username.ilike.${pattern},full_name.ilike.${pattern}`)
    .eq('is_active', true)
    .limit(MAX_RESULTS)
    .order('full_name', { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const rows = profiles ?? [];

  // Attach active membership count so the wizard can warn about users who are
  // already members of another company (multi-company not yet supported).
  const userIds = rows.map(u => u.id);
  const memberCounts: Record<string, number> = {};

  if (userIds.length > 0) {
    const { data: memberships } = await supabase
      .from('company_members')
      .select('user_id')
      .in('user_id', userIds)
      .eq('is_active', true);

    if (memberships) {
      for (const m of memberships) {
        memberCounts[m.user_id] = (memberCounts[m.user_id] ?? 0) + 1;
      }
    }
  }

  const results = rows.map(u => ({
    id:                     u.id,
    full_name:              u.full_name,
    email:                  u.email,
    username:               u.username,
    is_active:              u.is_active,
    active_membership_count: memberCounts[u.id] ?? 0,
  }));

  return NextResponse.json(results);
}
