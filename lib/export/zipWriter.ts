/**
 * Minimal in-memory ZIP builder using only Node.js built-ins.
 * Uses DEFLATE compression (method 8) via zlib.deflateRawSync.
 */

import { deflateRawSync } from 'node:zlib';

// CRC-32 lookup table (ISO 3309 polynomial)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const b of data) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): Buffer {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(n >>> 0, 0);
  return b;
}

function u32(n: number): Buffer {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function dosDateTime(d: Date) {
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date: date & 0xffff, time: time & 0xffff };
}

export interface ZipEntry {
  name: string;    // file path inside the ZIP
  data: Buffer;    // raw content to compress
}

/**
 * Build an in-memory ZIP buffer from an array of entries.
 * Safe for files up to a few hundred MB combined.
 */
export function buildZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const dt = dosDateTime(new Date());

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data, { level: 6 });
    const crc = crc32(entry.data);

    const localHeader = Buffer.concat([
      u32(0x04034b50),         // local file header signature
      u16(20),                 // version needed: 2.0
      u16(0x0800),             // flags: UTF-8 filename
      u16(8),                  // compression: deflate
      u16(dt.time),
      u16(dt.date),
      u32(crc),
      u32(compressed.length),  // compressed size
      u32(entry.data.length),  // uncompressed size
      u16(nameBytes.length),
      u16(0),                  // extra field length
      nameBytes,
    ]);

    central.push(Buffer.concat([
      u32(0x02014b50),         // central directory signature
      u16(20),                 // version made by
      u16(20),                 // version needed
      u16(0x0800),             // flags
      u16(8),                  // compression
      u16(dt.time),
      u16(dt.date),
      u32(crc),
      u32(compressed.length),
      u32(entry.data.length),
      u16(nameBytes.length),
      u16(0),                  // extra
      u16(0),                  // comment
      u16(0),                  // disk start
      u16(0),                  // internal attrs
      u32(0),                  // external attrs
      u32(offset),             // local header offset
      nameBytes,
    ]));

    offset += localHeader.length + compressed.length;
    localParts.push(localHeader, compressed);
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralBuf.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}
