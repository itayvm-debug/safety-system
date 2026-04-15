import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/api';
import { PDFDocument } from 'pdf-lib';
import path from 'path';
import fs from 'fs';

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { appointment_id, overlay_image_b64 } = await request.json();
  if (!appointment_id || !overlay_image_b64) {
    return NextResponse.json(
      { error: 'appointment_id ו-overlay_image_b64 נדרשים' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  console.log('[generate-pdf] start, appointment_id=', appointment_id, 'overlay length=', overlay_image_b64.length);

  // 1. Load PDF template from public/forms/form-18g.pdf
  const pdfPath = path.join(process.cwd(), 'public', 'forms', 'form-18g.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error('[generate-pdf] template not found at', pdfPath);
    return NextResponse.json({ error: `template PDF לא נמצא: ${pdfPath}` }, { status: 500 });
  }
  console.log('[generate-pdf] loading template from', pdfPath);
  const templateBytes = fs.readFileSync(pdfPath);
  console.log('[generate-pdf] template loaded, bytes=', templateBytes.length);

  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const { width, height } = page.getSize();
  console.log('[generate-pdf] PDF page size:', width, 'x', height);

  // 2. Decode overlay PNG (transparent) captured by html2canvas
  const base64Data = overlay_image_b64.replace(/^data:image\/png;base64,/, '');
  const pngBytes = Buffer.from(base64Data, 'base64');
  console.log('[generate-pdf] PNG decoded, bytes=', pngBytes.length);

  const pngImage = await pdfDoc.embedPng(pngBytes);
  console.log('[generate-pdf] PNG embedded, size=', pngImage.width, 'x', pngImage.height);

  // 3. Draw overlay on top of the PDF background, covering the full page
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width,
    height,
  });
  console.log('[generate-pdf] overlay drawn on page');

  // 4. Serialize PDF
  const pdfBytes = await pdfDoc.save();
  console.log('[generate-pdf] PDF saved, bytes=', pdfBytes.length);

  // 5. Upload to Supabase storage
  const storagePath = `appointment-pdfs/${appointment_id}.pdf`;
  console.log('[generate-pdf] uploading to storage:', storagePath);
  const { error: uploadError } = await supabase.storage
    .from('worker-files')
    .upload(storagePath, Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('[generate-pdf] upload failed:', uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }
  console.log('[generate-pdf] upload success');

  // 6. Update appointment record with pdf_url
  const { error: updateError } = await supabase
    .from('lifting_machine_appointments')
    .update({ pdf_url: storagePath })
    .eq('id', appointment_id);

  if (updateError) {
    console.error('[generate-pdf] DB update failed:', updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  console.log('[generate-pdf] done, pdf_url=', storagePath);
  return NextResponse.json({ pdf_url: storagePath });
}
