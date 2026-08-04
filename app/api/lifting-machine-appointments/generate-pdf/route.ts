import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyAdminRole } from '@/lib/auth/company-context';
import { PDFDocument } from 'pdf-lib';

export async function POST(request: NextRequest) {
  const { context, error } = await requireCompanyAdminRole();
  if (error) return error;
  const { companyId } = context;

  const { appointment_id, overlay_image_b64 } = await request.json();
  if (!appointment_id || !overlay_image_b64) {
    return NextResponse.json(
      { error: 'appointment_id ו-overlay_image_b64 נדרשים' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Verify appointment belongs to this company
  const { data: appt } = await supabase
    .from('lifting_machine_appointments')
    .select('id')
    .eq('id', appointment_id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!appt) return NextResponse.json({ error: 'מינוי לא נמצא' }, { status: 404 });

  // Decode the PNG captured by html2canvas
  const base64Data = overlay_image_b64.replace(/^data:image\/png;base64,/, '');
  const pngBytes = Buffer.from(base64Data, 'base64');

  // Create a new PDF document (A4: 595 × 842 pts)
  const pdfDoc = await PDFDocument.create();
  const pngImage = await pdfDoc.embedPng(pngBytes);

  const A4_W = 595, A4_H = 842;
  const { width: imgW, height: imgH } = pngImage;
  const scale = A4_W / imgW;
  const drawW = A4_W;
  const drawH = imgH * scale;

  const pageH = Math.max(drawH, A4_H);
  const page = pdfDoc.addPage([A4_W, pageH]);

  page.drawImage(pngImage, {
    x: 0,
    y: pageH - drawH,
    width: drawW,
    height: drawH,
  });

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

  const { error: updateError } = await supabase
    .from('lifting_machine_appointments')
    .update({ pdf_url: storagePath })
    .eq('id', appointment_id)
    .eq('company_id', companyId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ pdf_url: storagePath });
}
