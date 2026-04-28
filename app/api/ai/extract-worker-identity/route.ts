import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/api';

export const runtime = 'nodejs';

type ExtractedField = { value: string | null; confidence: number };

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'ai_unavailable' });
  }

  let body: { path?: string; document_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const { path, document_type } = body;
  if (!path) return NextResponse.json({ error: 'path נדרש' }, { status: 400 });

  // Get signed URL to fetch the file
  const supabase = createServiceClient();
  const { data: signedData, error: signedError } = await supabase.storage
    .from('worker-files')
    .createSignedUrl(path, 60);

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ success: false, error: 'file_not_found' });
  }

  let buffer: ArrayBuffer;
  try {
    const fileRes = await fetch(signedData.signedUrl);
    if (!fileRes.ok) return NextResponse.json({ success: false, error: 'file_fetch_failed' });

    const contentType = fileRes.headers.get('content-type') || '';
    if (contentType.includes('pdf')) {
      return NextResponse.json({ success: false, error: 'pdf_not_supported' });
    }

    buffer = await fileRes.arrayBuffer();
  } catch {
    return NextResponse.json({ success: false, error: 'file_fetch_failed' });
  }

  // Claude vision limit ~5MB base64 → keep source under 3.5MB
  if (buffer.byteLength > 3.5 * 1024 * 1024) {
    return NextResponse.json({ success: false, error: 'image_too_large' });
  }

  const base64 = Buffer.from(buffer).toString('base64');

  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const mediaTypeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp',
  };
  const mediaType = mediaTypeMap[ext] ?? 'image/jpeg';

  const isPassport = document_type === 'passport';

  const prompt = isPassport
    ? `This is a passport image. Return ONLY valid JSON, no markdown or explanation:
{"full_name":{"value":"NAME_OR_NULL","confidence":0.0},"national_id":{"value":null,"confidence":0},"passport_number":{"value":"NUMBER_OR_NULL","confidence":0.0},"worker_type":{"value":"foreign","confidence":1.0}}
Rules: full_name = Latin characters preferred. passport_number = from MRZ or data page. Confidence: 0.95+ clear, 0.7–0.94 readable, <0.7 unclear. null for unreadable fields.`
    : `This is an Israeli ID card (תעודת זהות). Return ONLY valid JSON, no markdown or explanation:
{"full_name":{"value":"NAME_OR_NULL","confidence":0.0},"national_id":{"value":"NUMBER_OR_NULL","confidence":0.0},"passport_number":{"value":null,"confidence":0},"worker_type":{"value":"israeli","confidence":1.0}}
Rules: full_name = Hebrew (שם פרטי + שם משפחה). national_id = 9-digit מספר ת.ז. Confidence: 0.95+ clear, 0.7–0.94 readable, <0.7 unclear. null for unreadable fields.`;

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
  } catch {
    return NextResponse.json({ success: false, error: 'ai_error' });
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => '');
    console.error('[extract-worker-identity] Anthropic error:', anthropicRes.status, errText);
    return NextResponse.json({ success: false, error: 'ai_error' });
  }

  const anthropicData = await anthropicRes.json();
  const text: string = anthropicData.content?.[0]?.text ?? '';

  let extracted: Record<string, ExtractedField>;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    extracted = JSON.parse(match?.[0] ?? '{}');
  } catch {
    console.error('[extract-worker-identity] JSON parse failed, raw text:', text);
    return NextResponse.json({ success: false, error: 'parse_error' });
  }

  const fields = ['full_name', 'national_id', 'passport_number', 'worker_type'] as const;
  for (const f of fields) {
    if (!extracted[f] || typeof extracted[f] !== 'object') {
      extracted[f] = { value: null, confidence: 0 };
    }
  }

  const confidences = fields
    .map((f) => extracted[f]?.confidence ?? 0)
    .filter((c) => c > 0);
  const overall = confidences.length > 0
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
    : 0;

  const fieldLabels: Record<string, string> = {
    full_name: 'שם מלא',
    national_id: 'מספר תעודת זהות',
    passport_number: 'מספר דרכון',
    worker_type: 'סוג עובד',
  };

  const warnings: string[] = [];
  if (overall > 0 && overall < 0.7) {
    warnings.push('איכות זיהוי נמוכה — אנא בדוק את הנתונים בקפידה');
  }
  for (const f of fields) {
    const field = extracted[f];
    if (field?.value !== null && field?.value !== undefined && (field.confidence ?? 0) < 0.8) {
      warnings.push(`שדה "${fieldLabels[f]}" זוהה בביטחון נמוך`);
    }
  }

  return NextResponse.json({
    success: true,
    document_type: isPassport ? 'passport' : 'israeli_id',
    extracted,
    overall_confidence: overall,
    warnings,
  });
}
