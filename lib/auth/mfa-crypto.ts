/**
 * Encryption at rest for TOTP secrets (AES-256-GCM).
 * Key: MFA_ENCRYPTION_KEY — 32 random bytes, base64. Set in Vercel (all environments).
 * Without the key MFA operations fail closed (no enrollment, no verification).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function key(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) throw new Error('MFA_ENCRYPTION_KEY is not configured');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes (base64)');
  return k;
}

export function isMfaCryptoConfigured(): boolean {
  try { key(); return true; } catch { return false; }
}

/** Binds the ciphertext to the user, so a secret copied to another user's row does not decrypt. */
export function encryptSecret(plain: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), ct.toString('base64'), cipher.getAuthTag().toString('base64')].join(':');
}

export function decryptSecret(stored: string, userId: string): string {
  const [version, iv, ct, tag] = stored.split(':');
  if (version !== VERSION || !iv || !ct || !tag) throw new Error('unknown secret format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}
