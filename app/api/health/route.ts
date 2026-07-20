import { NextResponse } from 'next/server';
import { SYSTEM_VERSION } from '@/lib/system/version';

export const runtime = 'nodejs';
// No auth — public liveness probe for load balancers and uptime monitors
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: SYSTEM_VERSION,
    timestamp: new Date().toISOString(),
  });
}
