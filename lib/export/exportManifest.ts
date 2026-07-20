import { createHash } from 'node:crypto';
import type { TableExport } from './exportTables';
import { SYSTEM_VERSION } from '@/lib/system/version';
import { LEGAL } from '@/lib/legal/config';

export interface ManifestEntry {
  file: string;
  table: string;
  rowCount: number;
  sha256: string;
  sizeBytes: number;
}

export interface ExportManifest {
  schemaVersion: '1';
  systemVersion: string;
  exportedAt: string;
  legalTermsVersion: string;
  legalPrivacyVersion: string;
  tables: ManifestEntry[];
  totalRows: number;
  totalTables: number;
}

export function buildManifest(
  tables: TableExport[],
  fileBuffers: Map<string, Buffer>,
): ExportManifest {
  const exportedAt = tables[0]?.exportedAt ?? new Date().toISOString();

  const entries: ManifestEntry[] = tables.map(t => {
    const fileName = `${t.table}.jsonl`;
    const buf = fileBuffers.get(fileName) ?? Buffer.alloc(0);
    return {
      file: fileName,
      table: t.table,
      rowCount: t.rowCount,
      sha256: createHash('sha256').update(buf).digest('hex'),
      sizeBytes: buf.length,
    };
  });

  return {
    schemaVersion: '1',
    systemVersion: SYSTEM_VERSION,
    exportedAt,
    legalTermsVersion: LEGAL.termsVersion,
    legalPrivacyVersion: LEGAL.privacyVersion,
    tables: entries,
    totalRows: entries.reduce((s, e) => s + Math.max(0, e.rowCount), 0),
    totalTables: entries.length,
  };
}
