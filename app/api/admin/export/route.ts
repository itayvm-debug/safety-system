import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { auditLog } from '@/lib/audit/log';
import { exportAllTables, toJsonl } from '@/lib/export/exportTables';
import { buildManifest } from '@/lib/export/exportManifest';
import { buildZip } from '@/lib/export/zipWriter';
import { rateLimitExportDb } from '@/lib/rate-limit/db';

export const runtime = 'nodejs';
// Generous timeout for large exports
export const maxDuration = 60;

export async function GET() {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const rl = await rateLimitExportDb(session!.userId);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'יותר מדי יצואות. נסה שנית בעוד מספר דקות.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  const tables = await exportAllTables();

  // Build JSONL buffers
  const fileBuffers = new Map<string, Buffer>();
  for (const t of tables) {
    fileBuffers.set(`${t.table}.jsonl`, toJsonl(t.rows));
  }

  // Build manifest
  const manifest = buildManifest(tables, fileBuffers);
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
  fileBuffers.set('manifest.json', manifestBuf);

  // Build ZIP
  const entries = [
    { name: 'manifest.json', data: manifestBuf },
    ...[...fileBuffers.entries()]
      .filter(([name]) => name !== 'manifest.json')
      .map(([name, data]) => ({ name, data })),
  ];
  const zipBuffer = buildZip(entries);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `safedoc-export-${dateStr}.zip`;

  void auditLog({
    user_id: session!.userId,
    user_email: session!.email,
    action: 'system_export_created',
    metadata: {
      tables: manifest.totalTables,
      totalRows: manifest.totalRows,
      filename,
      sizeBytes: zipBuffer.length,
    },
  });

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(zipBuffer.length),
      'Cache-Control':       'no-store',
    },
  });
}
