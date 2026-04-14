import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const workerId = request.nextUrl.searchParams.get('worker_id');
  const supabase = createServiceClient();

  const query = supabase
    .from('lifting_machine_appointments')
    .select('*')
    .order('appointment_date', { ascending: false });

  if (workerId) query.eq('worker_id', workerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await request.json();
  const {
    worker_id, equipment_id,
    machine_name, manufacturer, machine_identifier, safe_working_load, power_type,
    appointer_name, appointer_role, appointer_phone, appointer_address, appointer_zip,
    appointment_date,
    operator_signature_b64, appointer_signature_b64,
    // שדות עובד לעדכון (אופציונלי)
    worker_father_name, worker_birth_year, worker_profession, worker_address,
  } = body;

  if (!worker_id) return NextResponse.json({ error: 'worker_id נדרש' }, { status: 400 });
  if (!machine_name?.trim()) return NextResponse.json({ error: 'שם המכונה נדרש' }, { status: 400 });
  if (!appointer_name?.trim()) return NextResponse.json({ error: 'שם הממנה נדרש' }, { status: 400 });

  const supabase = createServiceClient();

  // 1. העלאת חתימות ל-Storage
  let operatorSigUrl: string | null = null;
  let appointerSigUrl: string | null = null;

  if (operator_signature_b64) {
    const buffer = Buffer.from(operator_signature_b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const path = `appointment-signatures/${worker_id}-operator-${Date.now()}.png`;
    const { error: sigErr } = await supabase.storage.from('worker-files').upload(path, buffer, { contentType: 'image/png', upsert: true });
    if (!sigErr) operatorSigUrl = path;
  }

  if (appointer_signature_b64) {
    const buffer = Buffer.from(appointer_signature_b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const path = `appointment-signatures/${worker_id}-appointer-${Date.now()}.png`;
    const { error: sigErr } = await supabase.storage.from('worker-files').upload(path, buffer, { contentType: 'image/png', upsert: true });
    if (!sigErr) appointerSigUrl = path;
  }

  // 2. עדכון שדות עובד (אם הוזנו)
  const workerUpdates: Record<string, unknown> = {};
  if (worker_father_name !== undefined) workerUpdates.father_name = worker_father_name?.trim() || null;
  if (worker_birth_year !== undefined) workerUpdates.birth_year = worker_birth_year ? Number(worker_birth_year) : null;
  if (worker_profession !== undefined) workerUpdates.profession = worker_profession?.trim() || null;
  if (worker_address !== undefined) workerUpdates.address = worker_address?.trim() || null;

  if (Object.keys(workerUpdates).length > 0) {
    await supabase.from('workers').update(workerUpdates).eq('id', worker_id);
  }

  // 3. יצירת רשומת המינוי
  const { data, error } = await supabase
    .from('lifting_machine_appointments')
    .insert({
      worker_id,
      equipment_id: equipment_id || null,
      machine_name: machine_name.trim(),
      manufacturer: manufacturer?.trim() || null,
      machine_identifier: machine_identifier?.trim() || null,
      safe_working_load: safe_working_load?.trim() || null,
      power_type: power_type || null,
      appointer_name: appointer_name.trim(),
      appointer_role: appointer_role?.trim() || null,
      appointer_phone: appointer_phone?.trim() || null,
      appointer_address: appointer_address?.trim() || null,
      appointer_zip: appointer_zip?.trim() || null,
      appointment_date: appointment_date || new Date().toISOString().split('T')[0],
      operator_signature_url: operatorSigUrl,
      appointer_signature_url: appointerSigUrl,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 4. הפקת PDF (async — לא חוסמת)
  if (data) {
    generatePdfInBackground(data.id, body, operatorSigUrl, appointerSigUrl, supabase);
  }

  return NextResponse.json(data, { status: 201 });
}

// הפקת PDF ברקע — מעדכן pdf_url כשמוכן
async function generatePdfInBackground(
  appointmentId: string,
  body: Record<string, unknown>,
  operatorSigPath: string | null,
  appointerSigPath: string | null,
  supabase: ReturnType<typeof createServiceClient>
) {
  try {
    const { generateAppointmentPdf } = await import('@/lib/pdf/generate-appointment-pdf');
    const pdfPath = await generateAppointmentPdf({
      appointmentId,
      ...body,
      operatorSigPath,
      appointerSigPath,
    } as Parameters<typeof generateAppointmentPdf>[0], supabase);

    if (pdfPath) {
      await supabase
        .from('lifting_machine_appointments')
        .update({ pdf_url: pdfPath })
        .eq('id', appointmentId);
    }
  } catch (err) {
    console.error('[appointments] PDF generation failed:', err);
  }
}
