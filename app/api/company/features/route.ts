/**
 * GET /api/company/features
 * Returns the current company's feature flags for client-side use.
 * Lightweight — reads from the resolved company context (already cached per-request).
 */
import { NextResponse } from 'next/server';
import { getCurrentCompanyContext } from '@/lib/auth/company-context';

export async function GET() {
  const { context, error } = await getCurrentCompanyContext();
  if (error) return NextResponse.json({}, { status: 200 }); // return empty features on unauth
  return NextResponse.json(context.settings.features);
}
