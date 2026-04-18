import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/api';
import { PDFDocument } from 'pdf-lib';

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

  // 1. Decode the PNG captured by html2canvas
  const base64Data = overlay_image_b64.replace(/^data:image\/png;base64,/, '');
  const pngBytes = Buffer.from(base64Data, 'base64');

  // 2. Create a new PDF document (A4: 595 × 842 pts)
  const pdfDoc = await PDFDocument.create();
  const pngImage = await pdfDoc.embedPng(pngBytes);

  // Scale PNG to fit A4 width (maintain aspect ratio, align to top)
  const A4_W = 595, A4_H = 842;
  const { width: imgW, height: imgH } = pngImage;
  const scale = A4_W / imgW;
  const drawW = A4_W;
  const drawH = imgH * scale;

  // If content is taller than A4, use a taller page; otherwise use A4
  const pageH = Math.max(drawH, A4_H);
  const page = pdfDoc.addPage([A4_W, pageH]);

  // PDF coordinate system: y=0 at bottom, so draw from top
  page.drawImage(pngImage, {
    x: 0,
    y: pageH - drawH,
    width: drawW,
    height: drawH,
  });

  // 3. Serialize and upload to Supabase storage
  const pdfBytes = await pdfDoc.save();
  const storagePath = `appointment-pdfs/${appointment_id}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('worker-files')
    .upload(storagePath, Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // 4. Update appointment record with pdf_url
  const { error: updateError } = await supabase
    .from('lifting_machine_appointments')
    .update({ pdf_url: storagePath })
    .eq('id', appointment_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ pdf_url: storagePath });
}
