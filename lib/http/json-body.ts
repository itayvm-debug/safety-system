/**
 * Reads a route's JSON body safely.
 *
 * Code review 2026-11-19: ~45 API routes called `await request.json()` and then `field?.trim()`.
 * Malformed JSON, a non-object body, or a number where text was expected threw inside the route
 * and answered 500. Every write route now reads its body through this helper:
 *   - invalid JSON or a body that is not an object → 400
 *   - a listed text field that is present but not a string → 400
 * Valid requests behave exactly as before (the parsed object is returned unchanged).
 */
import { NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same shape routes had from request.json()
export type JsonBody = Record<string, any>;

export type JsonBodyResult = { ok: true; body: JsonBody } | { ok: false; error: NextResponse };

const bad = (error: string): JsonBodyResult => ({ ok: false, error: NextResponse.json({ error }, { status: 400 }) });

export async function readJsonObject(request: Request, textFields: readonly string[] = []): Promise<JsonBodyResult> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('בקשה לא תקינה');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return bad('בקשה לא תקינה');
  const obj = body as JsonBody;
  for (const key of textFields) {
    const v = obj[key];
    if (v !== undefined && v !== null && typeof v !== 'string') return bad(`ערך לא תקין בשדה ${key}`);
  }
  return { ok: true, body: obj };
}
